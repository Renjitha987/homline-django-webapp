"""JSON API (DRF) for the React frontend.

Validation reuses the existing Django forms so behaviour matches the old templates exactly.
Auth is session + CSRF (same origin): the React app reads the csrftoken cookie set by /api/bootstrap/.
"""
import urllib.parse
from pathlib import Path

from django.conf import settings
from django import forms as djforms
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib.auth.models import User
from django.core.paginator import Paginator
from django.db.models import Count, Q
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import panel
from .forms import (
    ComplaintSuggestionForm, LinkRequestForm, MembershipEnquiryForm, PwDRequestForm,
    QuickContactForm, ServiceRequestForm, UserProfileForm, UserRegistrationForm,
)
from .models import (
    Announcement, Category, ComplaintSuggestion, ContactEnquiry, FAQ, MembershipEnquiry,
    MembershipPlan, PwDRequest, Service, ServiceRequest, ServiceRequestLog, Update,
)
from .drf_auth import CsrfSessionAuthentication  # noqa: F401 (referenced from settings)
from .ratelimit import ratelimit
from .views import _can_view_request, _verify_request_access


# ---------------------------------------------------------------- plumbing
class SensitiveAPIView(APIView):
    """Base APIView for sensitive, authenticated, or staff/admin endpoints.
    Enforces strict Cache-Control headers so browsers never cache sensitive panel or user data.
    """
    def finalize_response(self, request, response, *args, **kwargs):
        res = super().finalize_response(request, response, *args, **kwargs)
        res['Cache-Control'] = 'no-cache, no-store, must-revalidate, private'
        res['Pragma'] = 'no-cache'
        res['Expires'] = '0'
        return res


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsSuperuser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


def limited(key, limit, **kw):
    """Per-IP rate limit for an APIView (reuses core.ratelimit)."""
    def deco(cls):
        return method_decorator(ratelimit(key, limit, **kw), name='dispatch')(cls)
    return deco


def form_errors(form):
    return {k: [e['message'] for e in v] for k, v in form.errors.get_json_data().items()}


def bad(form):
    return Response({'errors': form_errors(form)}, status=status.HTTP_400_BAD_REQUEST)


def form_data(request):
    """QueryDict-like data + files for Django forms from a DRF request (JSON, form or multipart)."""
    return request.data, request.FILES


def user_payload(u):
    if not u.is_authenticated:
        return None
    return {
        'id': u.id, 'username': u.username, 'email': u.email, 'first_name': u.first_name,
        'is_staff': u.is_staff, 'is_superuser': u.is_superuser, 'date_joined': u.date_joined,
        'role': 'admin' if u.is_superuser else 'staff' if u.is_staff else 'customer',
    }


# ---------------------------------------------------------------- serializers
class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'description', 'icon_class', 'order']


class ServiceSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)

    class Meta:
        model = Service
        fields = ['id', 'slug', 'title', 'category', 'short_summary', 'description', 'required_documents',
                  'homline_charge', 'third_party_fee', 'processing_time', 'is_featured', 'badge', 'icon_class']


class UpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Update
        fields = ['id', 'slug', 'title', 'category_tag', 'summary', 'content', 'published_at', 'is_featured']


class FAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQ
        fields = ['id', 'question', 'answer', 'category', 'order']


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = MembershipPlan
        fields = ['id', 'name', 'tagline', 'price', 'is_popular', 'features', 'welcome_benefits', 'order']


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ['id', 'message', 'badge_text', 'link_url']


class TimelineSerializer(serializers.ModelSerializer):
    # description is deliberately not exposed: it can hold internal wording entered by staff.
    class Meta:
        model = ServiceRequestLog
        fields = ['status', 'title', 'created_at']


class RequestSerializer(serializers.ModelSerializer):
    """Public tracking view: knowing the request ID must not reveal contact details."""
    service_title = serializers.CharField(source='get_service_title', read_only=True)
    category = serializers.CharField(source='service.category.name', default='', read_only=True)
    timeline = TimelineSerializer(source='timeline_logs', many=True, read_only=True)

    class Meta:
        model = ServiceRequest
        fields = ['request_id', 'full_name', 'service_title', 'contact_preference', 'category', 'service_charge',
                  'portal_fee', 'status', 'created_at', 'updated_at', 'timeline']


class ReceiptSerializer(RequestSerializer):
    """Receipt: full details, only served to the owner, staff or the browser session that submitted/tracked it."""
    class Meta(RequestSerializer.Meta):
        fields = RequestSerializer.Meta.fields + ['mobile', 'email', 'requirement_details']


class MembershipSerializer(serializers.ModelSerializer):
    plan = serializers.CharField(source='preferred_plan.name', default='', read_only=True)

    class Meta:
        model = MembershipEnquiry
        fields = ['id', 'name', 'place', 'plan', 'status', 'membership_code', 'open_date', 'valid_till', 'created_at']


def qr(url, size=150):
    return f'https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={urllib.parse.quote(url)}'


# ---------------------------------------------------------------- bootstrap + auth
class BootstrapView(APIView):
    """Everything the shell needs on first load; also sets the CSRF cookie."""
    permission_classes = []

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        get_token(request._request)
        return Response({
            'user': user_payload(request.user),
            'announcements': AnnouncementSerializer(
                Announcement.objects.filter(is_active=True).order_by('order', '-created_at'), many=True).data,
            'services': [{'id': s.id, 'title': s.title} for s in Service.objects.only('id', 'title')],
        })


@limited('login', 10)
class LoginView(APIView):
    permission_classes = []

    def post(self, request):
        ident = (request.data.get('username') or '').strip()
        password = request.data.get('password') or ''
        if not ident or not password:
            return Response({'errors': {'__all__': ['Enter your username and password.']}}, status=400)
        user = None
        if '@' in ident:
            match = User.objects.filter(email__iexact=ident).first()
            if match:
                user = authenticate(request._request, username=match.username, password=password)
        if not user:
            user = authenticate(request._request, username=ident, password=password)
        if user is None:
            return Response({'errors': {'__all__': ['Invalid username or password. Please try again.']}}, status=400)
        if not user.is_active:
            return Response({'errors': {'__all__': ['This account is currently inactive. Please contact support.']}}, status=400)
        login(request._request, user)
        request._request.session.set_expiry(1209600 if request.data.get('remember_me', True) not in (False, 'false', '0', 0) else 0)
        return Response({'user': user_payload(user)})


@limited('signup', 5)
class SignupView(APIView):
    permission_classes = []

    def post(self, request):
        form = UserRegistrationForm(request.data)
        if not form.is_valid():
            return bad(form)
        user = form.save(commit=False)
        user.set_password(form.cleaned_data['password'])
        user.first_name = form.cleaned_data.get('full_name', '')
        user.is_staff = user.is_superuser = False
        user.save()
        login(request._request, user, backend='django.contrib.auth.backends.ModelBackend')
        return Response({'user': user_payload(user)}, status=201)


class LogoutView(SensitiveAPIView):
    permission_classes = []

    def post(self, request):
        logout(request._request)
        response = Response({'ok': True, 'message': 'Logged out successfully.'})
        response.delete_cookie(
            settings.SESSION_COOKIE_NAME,
            domain=settings.SESSION_COOKIE_DOMAIN,
            path=settings.SESSION_COOKIE_PATH,
            samesite=settings.SESSION_COOKIE_SAMESITE,
        )
        return response


class MeView(SensitiveAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'user': user_payload(request.user)})

    def patch(self, request):
        form = UserProfileForm(request.data, instance=request.user)
        if not form.is_valid():
            return bad(form)
        form.save()
        return Response({'user': user_payload(request.user)})


class PasswordView(SensitiveAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        form = PasswordChangeForm(user=request.user, data=request.data)
        if not form.is_valid():
            return bad(form)
        update_session_auth_hash(request._request, form.save())
        return Response({'ok': True})


class DashboardView(SensitiveAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reqs = ServiceRequest.objects.filter(user=request.user).select_related('service').order_by('-created_at')
        mems = MembershipEnquiry.objects.filter(user=request.user).select_related('preferred_plan').order_by('-created_at')
        active = mems.filter(status__in=['Active', 'Approved']).first() or mems.first()
        return Response({
            'requests': RequestSerializer(reqs, many=True).data,
            'memberships': MembershipSerializer(mems, many=True).data,
            'active_membership': MembershipSerializer(active).data if active else None,
            'counts': {
                'total': reqs.count(), 'pending': reqs.filter(status='Pending').count(),
                'processing': reqs.filter(status='Processing').count(), 'completed': reqs.filter(status='Completed').count(),
            },
        })


class LinkRequestView(SensitiveAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        form = LinkRequestForm(request.data)
        if not form.is_valid():
            return bad(form)
        rid = form.cleaned_data['request_id'].strip().upper()
        obj = ServiceRequest.objects.filter(request_id__iexact=rid).first()
        if not obj:
            return Response({'errors': {'request_id': [f"No service request found with ID '{rid}'."]}}, status=404)
        if obj.user_id == request.user.id:
            return Response({'message': f'Request {rid} is already linked to your account.'})
        if obj.user_id is not None:
            return Response({'errors': {'request_id': [f'Request {rid} is associated with another account.']}}, status=400)
        obj.user = request.user
        obj.save(update_fields=['user'])
        return Response({'message': f'Service Request {rid} ({obj.get_service_title()}) successfully linked to your account!'})


# ---------------------------------------------------------------- public content
class HomeView(APIView):
    permission_classes = []

    def get(self, request):
        return Response({
            'services': ServiceSerializer(Service.objects.select_related('category').filter(is_featured=True)[:8], many=True).data,
            'updates': UpdateSerializer(Update.objects.filter(is_featured=True)[:4], many=True).data,
        })


class ServiceListView(APIView):
    permission_classes = []

    def get(self, request):
        qs = Service.objects.select_related('category')
        cat = request.GET.get('category', 'all')
        q = request.GET.get('q', '').strip()
        if cat and cat != 'all':
            qs = qs.filter(category__slug=cat)
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(short_summary__icontains=q) | Q(description__icontains=q))
        return Response({
            'categories': CategorySerializer(Category.objects.all(), many=True).data,
            'services': ServiceSerializer(qs, many=True).data,
        })


class ServiceDetailView(APIView):
    permission_classes = []

    def get(self, request, slug):
        s = get_object_or_404(Service.objects.select_related('category'), slug=slug)
        related = Service.objects.select_related('category').filter(category=s.category).exclude(id=s.id)[:3]
        return Response({'service': ServiceSerializer(s).data, 'related': ServiceSerializer(related, many=True).data})


class UpdateListView(APIView):
    permission_classes = []

    def get(self, request):
        qs = Update.objects.all()
        tag = request.GET.get('tag', 'all')
        if tag and tag != 'all':
            qs = qs.filter(category_tag=tag)
        return Response({'updates': UpdateSerializer(qs, many=True).data,
                         'tags': [c[0] for c in Update.TAG_CHOICES]})


class UpdateDetailView(APIView):
    permission_classes = []

    def get(self, request, slug):
        u = get_object_or_404(Update, slug=slug)
        return Response({'update': UpdateSerializer(u).data,
                         'recent': UpdateSerializer(Update.objects.exclude(id=u.id)[:4], many=True).data})


class FAQListView(APIView):
    permission_classes = []

    def get(self, request):
        qs = FAQ.objects.all()
        cat = request.GET.get('cat', 'all')
        q = request.GET.get('q', '').strip()
        if cat and cat != 'all':
            qs = qs.filter(category=cat)
        if q:
            qs = qs.filter(Q(question__icontains=q) | Q(answer__icontains=q))
        return Response({'faqs': FAQSerializer(qs, many=True).data, 'categories': [c[0] for c in FAQ.CATEGORY_CHOICES]})


class PlanListView(APIView):
    permission_classes = []

    def get(self, request):
        return Response({'plans': PlanSerializer(MembershipPlan.objects.all(), many=True).data})


# ---------------------------------------------------------------- public submissions
class _Submit(APIView):
    permission_classes = []
    parser_classes = [JSONParser, MultiPartParser, FormParser]


@limited('request', 10)
class RequestCreateView(_Submit):
    def post(self, request):
        form = ServiceRequestForm(request.data, request.FILES)
        if not form.is_valid():
            return bad(form)
        obj = form.save(commit=False)
        upload = form.cleaned_data.get('document_upload')
        if upload:
            obj.document_original_name = Path(upload.name).name[:255]
        if obj.service:
            obj.service_charge = obj.service.homline_charge
            obj.portal_fee = obj.service.third_party_fee
        if request.user.is_authenticated:
            obj.user = request.user
        obj.save()
        ServiceRequestLog.objects.create(request=obj, status='Pending', title='Request Registered',
                                         description='Your digital service request has been logged successfully into HOMline systems.')
        _verify_request_access(request, obj)
        return Response({'request_id': obj.request_id}, status=201)


@limited('track', 30, methods=('GET',))
class TrackView(APIView):
    permission_classes = []

    def get(self, request, request_id):
        obj = ServiceRequest.objects.filter(request_id__iexact=request_id).first()
        if not obj:
            raise NotFound(f"No service request found with ID '{request_id}'. Please verify your reference number.")
        _verify_request_access(request, obj)
        track_url = request.build_absolute_uri(f'/track/{obj.request_id}')
        return Response({'request': RequestSerializer(obj).data, 'qr_code_url': qr(track_url)})


class ReceiptView(APIView):
    permission_classes = []

    def get(self, request, request_id):
        obj = get_object_or_404(ServiceRequest, request_id__iexact=request_id)
        if not _can_view_request(request, obj):
            raise PermissionDenied('Open your request from the tracking page to view its receipt.')
        track_url = request.build_absolute_uri(f'/track/{obj.request_id}')
        return Response({'request': ReceiptSerializer(obj).data, 'qr_code_url': qr(track_url)})


@limited('contact', 10)
class ContactView(_Submit):
    def post(self, request):
        form = QuickContactForm(request.data)
        if not form.is_valid():
            return bad(form)
        ContactEnquiry.objects.create(**form.cleaned_data)
        return Response({'message': 'Thank you. Your message has been received, and the HOMline team will follow up by Call / WhatsApp.'}, status=201)


@limited('pwd', 10)
class PwDView(_Submit):
    def post(self, request):
        form = PwDRequestForm(request.data)
        if not form.is_valid():
            return bad(form)
        obj = form.save()
        return Response({'name': obj.name, 'message': 'Your PwD-Friendly Assistance request has been registered! Dedicated caseworkers are ready to assist you.'}, status=201)


@limited('complaint', 10)
class ComplaintView(_Submit):
    def post(self, request):
        form = ComplaintSuggestionForm(request.data, request.FILES)
        if not form.is_valid():
            return bad(form)
        obj = form.save(commit=False)
        upload = form.cleaned_data.get('supporting_document')
        if upload:
            obj.document_original_name = Path(upload.name).name[:255]
        obj.save()
        request._request.session['last_complaint_ref'] = obj.reference_no
        return Response({'reference_no': obj.reference_no, 'entry_type': obj.entry_type, 'name': obj.name}, status=201)


class ComplaintReceivedView(APIView):
    permission_classes = []

    def get(self, request, reference_no):
        if request.session.get('last_complaint_ref') != reference_no:
            raise PermissionDenied('Submit the form to see this confirmation.')
        obj = get_object_or_404(ComplaintSuggestion, reference_no=reference_no)
        return Response({'reference_no': obj.reference_no, 'entry_type': obj.entry_type, 'created_at': obj.created_at})


@limited('membership', 20, methods=('POST', 'GET'))
class MembershipView(_Submit):
    def post(self, request):
        form = MembershipEnquiryForm(request.data)
        if not form.is_valid():
            return bad(form)
        obj = form.save(commit=False)
        if request.user.is_authenticated:
            obj.user = request.user
        obj.save()
        plan = obj.preferred_plan.name if obj.preferred_plan else 'HOMline'
        return Response({'message': f'Thank you {obj.name}! Your membership request for {plan} has been registered. '
                                    'Our admin team will verify details and send your Unique Membership Code to your WhatsApp.'}, status=201)

    def get(self, request):
        """Membership code check (masked mobile)."""
        code = request.GET.get('code', '').strip()
        obj = MembershipEnquiry.objects.filter(membership_code__iexact=code).first() if code else None
        if not obj:
            raise NotFound(f"No active membership record found for '{code}'. Please check your Membership Code.")
        return Response({**MembershipSerializer(obj).data, 'masked_mobile': '*' * 6 + obj.mobile[-4:]})


class MembershipCardView(APIView):
    permission_classes = []

    def get(self, request, code):
        obj = get_object_or_404(MembershipEnquiry.objects.select_related('preferred_plan'), membership_code__iexact=code)
        return Response({**MembershipSerializer(obj).data,
                         'qr_code_url': qr(request.build_absolute_uri(f'/membership/card/{obj.membership_code}'), 140)})


# ---------------------------------------------------------------- panel (staff / admin)
def _field_schema(form):
    out = []
    for name, f in form.fields.items():
        w = f.widget
        kind = ('checkbox' if isinstance(w, djforms.CheckboxInput) else 'select' if isinstance(w, djforms.Select)
                else 'textarea' if isinstance(w, djforms.Textarea) else 'date' if isinstance(f, djforms.DateField)
                else 'password' if isinstance(w, djforms.PasswordInput) else 'number' if isinstance(f, djforms.IntegerField)
                else 'file' if isinstance(w, djforms.FileInput) else 'text')
        val = form[name].value()
        out.append({
            'name': name, 'label': f.label or name.replace('_', ' ').title(), 'type': kind, 'required': f.required,
            'help': f.help_text, 'value': '' if val is None or kind in ('password', 'file') else (str(val) if kind != 'checkbox' else bool(val)),
            'choices': [{'value': str(v), 'label': str(l)} for v, l in getattr(f, 'choices', [])] if kind == 'select' else None,
        })
    return out


def _section_or_404(request, key):
    cfg = panel.SECTIONS.get(key)
    if not cfg:
        raise NotFound()
    if not cfg.get('queue') and not request.user.is_superuser:
        raise PermissionDenied()
    return cfg


def _check_uploads(request):
    """Same extension / size / signature rules as the public forms."""
    from .forms import validate_document
    for name, allowed in (('document_upload', {'.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'}),
                          ('supporting_document', {'.pdf', '.jpg', '.jpeg', '.png'})):
        up = request.FILES.get(name)
        if up:
            try:
                validate_document(up, allowed)
            except djforms.ValidationError as e:
                return Response({'errors': {name: list(e.messages)}}, status=400)


def _log_status(obj, title=None):
    ServiceRequestLog.objects.create(request=obj, status=obj.status, title=title or f'Status changed to {obj.status}',
                                     description='Request updated by HOMline support.')


def _store_original_name(obj, request):
    for field, name_field in (('document_upload', 'document_original_name'), ('supporting_document', 'document_original_name')):
        up = request.FILES.get(field)
        if up and hasattr(obj, name_field):
            setattr(obj, name_field, Path(up.name).name[:255])
            obj.save(update_fields=[name_field])


class PanelMetaView(SensitiveAPIView):
    permission_classes = [IsStaff]

    def get(self, request):
        sup = request.user.is_superuser
        return Response({'sections': [
            {'key': k, 'title': c['title'], 'icon': c['icon'], 'queue': bool(c.get('queue'))}
            for k, c in panel.SECTIONS.items() if c.get('queue') or sup]})


class PanelOverviewView(SensitiveAPIView):
    permission_classes = [IsStaff]

    def get(self, request):
        stats = []
        for key, c in panel.SECTIONS.items():
            if c.get('queue'):
                m = c['model']
                stats.append({'key': key, 'title': c['title'], 'icon': c['icon'],
                              'open': m.objects.exclude(status__in=c['done']).count(), 'total': m.objects.count()})
        by_status = {s: n for s, n in ServiceRequest.objects.values_list('status').annotate(n=Count('id'))}
        recent_q = request.GET.get('q', '').strip()
        recent = ServiceRequest.objects.select_related('service')
        if recent_q:
            recent = recent.filter(Q(request_id__icontains=recent_q) | Q(full_name__icontains=recent_q) | Q(mobile__icontains=recent_q)
                                   | Q(service__title__icontains=recent_q) | Q(service_name_manual__icontains=recent_q))
        return Response({'stats': stats, 'by_status': by_status, 'recent': [
            {'id': r.id, 'request_id': r.request_id, 'full_name': r.full_name, 'mobile': r.mobile,
             'service': r.get_service_title(), 'status': r.status, 'created_at': r.created_at} for r in recent[:8]]})


class PanelListView(SensitiveAPIView):
    permission_classes = [IsStaff]

    def get(self, request, key):
        cfg = _section_or_404(request, key)
        model = cfg['model']
        qs = panel.apply_filters(cfg, model.objects.all(), request.GET)
        page = Paginator(qs, 20).get_page(request.GET.get('page'))
        names = {f.name for f in model._meta.fields}
        heads = [model._meta.get_field(c).verbose_name.title() if c in names else c.replace('get_', '').replace('_', ' ').title()
                 for c in cfg['cols']]
        queue = bool(cfg.get('queue'))
        sup = request.user.is_superuser
        actions = [{'key': k, 'label': l} for k, l in cfg.get('actions', [])]
        if sup:
            actions.append({'key': 'delete', 'label': 'Delete selected'})
        return Response({
            'title': cfg['title'], 'heads': heads, 'queue': queue, 'filters': panel.filter_defs(cfg), 'date': bool(cfg.get('date')),
            'actions': actions, 'exportable': True,
            'rows': [{'id': o.pk, 'cells': [str(panel._cell(o, c)) for c in cfg['cols']],
                      'status': getattr(o, 'status', None), 'links': panel.row_links(key, o) if queue else {}} for o in page],
            'page': page.number, 'pages': page.paginator.num_pages, 'count': page.paginator.count,
            'can_create': queue or sup,
        })

    def post(self, request, key):
        cfg = _section_or_404(request, key)
        bad_upload = _check_uploads(request)
        if bad_upload:
            return bad_upload
        form = panel._form_class(cfg, full=True)(request.data, request.FILES)
        if not form.is_valid():
            return bad(form)
        obj = form.save()
        _store_original_name(obj, request)
        if key == 'requests':
            _log_status(obj, 'Request registered')
        return Response({'id': obj.pk}, status=201)


class PanelBulkView(SensitiveAPIView):
    permission_classes = [IsStaff]

    def post(self, request, key):
        cfg = _section_or_404(request, key)
        action = request.data.get('action', '')
        ids = [i for i in request.data.get('ids', []) if str(i).isdigit()]
        qs = cfg['model'].objects.filter(pk__in=ids)
        if action == 'delete':
            if not request.user.is_superuser:
                raise PermissionDenied()
            n = qs.count()
            qs.delete()
            return Response({'count': n, 'message': f'{n} item(s) deleted.'})
        allowed = dict(cfg.get('actions', []))
        if action not in allowed:
            return Response({'errors': {'__all__': ['Unknown action.']}}, status=400)
        n = 0
        for obj in qs:
            if action == 'approve':
                panel.approve_membership(obj)
            else:
                obj.status = action.split(':', 1)[1]
                obj.save()
                if key == 'requests':
                    _log_status(obj)
            n += 1
        return Response({'count': n, 'message': f'{n} item(s): {allowed[action]}.'})


class PanelExportView(SensitiveAPIView):
    permission_classes = [IsStaff]

    def get(self, request, key):
        import csv
        from django.http import HttpResponse
        cfg = _section_or_404(request, key)
        qs = panel.apply_filters(cfg, cfg['model'].objects.all(), request.GET)
        cols = cfg.get('export', cfg['cols'])
        names = {f.name for f in cfg['model']._meta.fields}
        resp = HttpResponse(content_type='text/csv')
        resp['Content-Disposition'] = f'attachment; filename="homline_{key}.csv"'
        resp['Cache-Control'] = 'no-cache, no-store, must-revalidate, private'
        resp['Pragma'] = 'no-cache'
        resp['Expires'] = '0'
        w = csv.writer(resp)
        w.writerow([cfg['model']._meta.get_field(c).verbose_name.title() if c in names else c.replace('get_', '').replace('_', ' ').title() for c in cols])
        for o in qs:
            w.writerow([_csv_safe(panel._cell(o, c)) for c in cols])
        return resp


def _csv_safe(v):
    """Neutralise spreadsheet formula injection in exported text."""
    v = str(v)
    return "'" + v if v[:1] in ('=', '+', '-', '@') else v


class PanelDetailView(SensitiveAPIView):
    permission_classes = [IsStaff]

    def _obj(self, request, key, pk):
        cfg = _section_or_404(request, key)
        return cfg, get_object_or_404(cfg['model'], pk=pk)

    def get(self, request, key, pk=None):
        cfg = _section_or_404(request, key)
        obj = get_object_or_404(cfg['model'], pk=pk) if pk else None
        full = request.user.is_superuser or obj is None
        form = panel._form_class(cfg, full=full)(instance=obj)
        details, doc_url = [], None
        if obj and cfg.get('queue'):
            from django.db import models as dj
            for f in obj._meta.fields:
                if f.name in form.fields or f.name == 'id' or isinstance(f, dj.FileField):
                    continue
                v = panel._cell(obj, f.name)
                if v not in ('', None):
                    details.append({'label': f.verbose_name.title(), 'value': str(v)})
            if cfg.get('doc') and (getattr(obj, 'document_upload', None) or getattr(obj, 'supporting_document', None)):
                doc_url = f"/staff/{'requests' if key == 'requests' else 'complaints'}/{getattr(obj, cfg['doc_arg'])}/document/"
        links = panel.row_links(key, obj) if obj and cfg.get('queue') else {}
        timeline = []
        if key == 'requests' and obj:
            timeline = [{'id': l.id, 'status': l.status, 'title': l.title, 'description': l.description, 'created_at': l.created_at}
                        for l in obj.timeline_logs.all()]
        return Response({
            'title': cfg['title'], 'label': str(obj) if obj else 'New', 'fields': _field_schema(form),
            'details': details, 'doc_url': doc_url, 'links': links, 'can_delete': bool(obj) and request.user.is_superuser,
            'timeline': timeline, 'can_timeline': key == 'requests' and bool(obj),
            'status_choices': [{'value': v, 'label': l} for v, l in ServiceRequest.STATUS_CHOICES] if key == 'requests' else [],
        })

    def patch(self, request, key, pk):
        cfg, obj = self._obj(request, key, pk)
        bad_upload = _check_uploads(request)
        if bad_upload:
            return bad_upload
        old_status = getattr(obj, 'status', None)
        form = panel._form_class(cfg, full=request.user.is_superuser)(request.data, request.FILES, instance=obj)
        if not form.is_valid():
            return bad(form)
        saved = form.save()
        _store_original_name(saved, request)
        if key == 'requests' and old_status != saved.status:
            _log_status(saved)
        return Response({'ok': True})

    def delete(self, request, key, pk):
        cfg, obj = self._obj(request, key, pk)
        if not request.user.is_superuser:
            raise PermissionDenied()
        obj.delete()
        return Response(status=204)


class PanelTimelineView(SensitiveAPIView):
    """Add a manual timeline entry to a request (visible to the customer on the tracker); admins can delete entries."""
    permission_classes = [IsStaff]

    def post(self, request, pk):
        obj = get_object_or_404(ServiceRequest, pk=pk)
        title = (request.data.get('title') or '').strip()
        st = request.data.get('status') or obj.status
        if not title or st not in dict(ServiceRequest.STATUS_CHOICES):
            return Response({'errors': {'title': ['Enter a title and a valid status.']}}, status=400)
        ServiceRequestLog.objects.create(request=obj, status=st, title=title[:200], description=(request.data.get('description') or '')[:1000])
        return Response({'ok': True}, status=201)

    def delete(self, request, pk, log_id):
        if not request.user.is_superuser:
            raise PermissionDenied()
        get_object_or_404(ServiceRequestLog, pk=log_id, request_id=pk).delete()
        return Response(status=204)


def _user_row(u):
    return {'id': u.pk, 'cells': [u.username, u.email, panel._role(u), 'Yes' if u.is_active else 'No', str(u.date_joined)],
            'status': None, 'links': {}}


class PanelUsersView(SensitiveAPIView):
    permission_classes = [IsSuperuser]

    def get(self, request):
        q = request.GET.get('q', '').strip()
        qs = User.objects.all().order_by('-is_superuser', '-is_staff', 'username')
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(email__icontains=q))
        role = request.GET.get('role')
        if role == 'admin':
            qs = qs.filter(is_superuser=True)
        elif role == 'staff':
            qs = qs.filter(is_staff=True, is_superuser=False)
        elif role == 'customer':
            qs = qs.filter(is_staff=False)
        if request.GET.get('is_active') in ('true', 'false'):
            qs = qs.filter(is_active=request.GET['is_active'] == 'true')
        page = Paginator(qs, 20).get_page(request.GET.get('page'))
        return Response({
            'title': 'Users', 'heads': ['Username', 'Email', 'Role', 'Active', 'Joined'], 'queue': False, 'date': False,
            'filters': [{'name': 'role', 'label': 'Role', 'options': [{'value': 'admin', 'label': 'Admin'}, {'value': 'staff', 'label': 'Staff'}, {'value': 'customer', 'label': 'Customer'}]},
                        {'name': 'is_active', 'label': 'Active', 'options': [{'value': 'true', 'label': 'Yes'}, {'value': 'false', 'label': 'No'}]}],
            'actions': [], 'exportable': False, 'rows': [_user_row(u) for u in page], 'page': page.number,
            'pages': page.paginator.num_pages, 'count': page.paginator.count, 'can_create': True})

    def post(self, request):
        form = panel.UserForm(request.data)
        if not form.is_valid():
            return bad(form)
        return Response({'id': form.save().pk}, status=201)


class PanelUserDetailView(SensitiveAPIView):
    permission_classes = [IsSuperuser]

    def get(self, request, pk=None):
        obj = get_object_or_404(User, pk=pk) if pk else None
        form = panel.UserForm(instance=obj)
        return Response({'title': 'Users', 'label': obj.username if obj else 'New', 'fields': _field_schema(form),
                         'details': [], 'doc_url': None, 'links': {}, 'can_delete': False, 'timeline': [],
                         'can_timeline': False, 'status_choices': []})

    def patch(self, request, pk):
        obj = get_object_or_404(User, pk=pk)
        form = panel.UserForm(request.data, instance=obj)
        if not form.is_valid():
            return bad(form)
        if obj.pk == request.user.pk and form.cleaned_data['role'] != 'admin':
            return Response({'errors': {'role': ['You cannot remove your own admin role.']}}, status=400)
        form.save()
        return Response({'ok': True})
