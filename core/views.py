import logging
from pathlib import Path

from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from functools import wraps
from django.core.exceptions import PermissionDenied
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404

from .models import ComplaintSuggestion, ServiceRequest

logger = logging.getLogger(__name__)


def staff_required(view):
    """Anonymous or non-staff visitors are sent to the site login."""
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not (request.user.is_authenticated and request.user.is_staff):
            return redirect_to_login(request.get_full_path(), '/login')
        return view(request, *args, **kwargs)
    return wrapper


def _verify_request_access(request, req_obj):
    ids = request.session.get('verified_requests', [])
    if req_obj.request_id not in ids:
        request.session['verified_requests'] = ids + [req_obj.request_id]


def _can_view_request(request, req_obj):
    u = request.user
    return (
        (u.is_authenticated and (u.is_staff or req_obj.user_id == u.id))
        or req_obj.request_id in request.session.get('verified_requests', [])
    )


def health_view(request):
    from django.db import connection
    try:
        connection.ensure_connection()
    except Exception:
        return JsonResponse({'status': 'database unavailable'}, status=503)
    return JsonResponse({'status': 'ok'})


def _serve_private_document(request, perm, field_file, original_name, label):
    if not request.user.has_perm(perm):
        raise PermissionDenied
    if not field_file:
        raise Http404('No document was uploaded.')
    try:
        handle = field_file.open('rb')
    except FileNotFoundError:
        raise Http404('The stored document could not be found.')
    except Exception:
        logger.exception('Document storage failure for %s', label)
        return HttpResponse('Document storage is temporarily unavailable.', status=503)
    return FileResponse(handle, as_attachment=True, filename=original_name or Path(field_file.name).name)


@staff_required
def private_request_document_view(request, request_id):
    req_obj = get_object_or_404(ServiceRequest, request_id__iexact=request_id)
    return _serve_private_document(request, 'core.view_servicerequest', req_obj.document_upload,
                                   req_obj.document_original_name, req_obj.request_id)


@staff_required
def private_complaint_document_view(request, reference_no):
    obj = get_object_or_404(ComplaintSuggestion, reference_no=reference_no)
    return _serve_private_document(request, 'core.view_complaintsuggestion', obj.supporting_document,
                                   obj.document_original_name, obj.reference_no)


_spa_html = None


def spa_view(request, path=''):
    """Serve the React app shell for every client-side route (the build is in static/app)."""
    global _spa_html
    index = Path(settings.BASE_DIR) / 'static' / 'app' / 'index.html'
    if _spa_html is None or settings.DEBUG:
        try:
            _spa_html = index.read_text(encoding='utf-8')
        except FileNotFoundError:
            return HttpResponse('Frontend not built. Run "npm ci && npm run build" in frontend/ (or use "npm run dev").',
                                status=503, content_type='text/plain')
    response = HttpResponse(_spa_html, content_type='text/html; charset=utf-8')
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0, private'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    return response
