from django.test import TestCase, Client
from rest_framework.test import APIClient
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from core.models import Category, Service, Update, MembershipPlan, FAQ, CustomerReview, ServiceRequest, ContactEnquiry, ServiceRequestLog
from core.forms import ServiceRequestForm

import tempfile
from django.conf import settings
from django.test import override_settings


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix='homline-test-media-'))
class HOMlineProjectTests(TestCase):
    def setUp(self):
        self.client = Client()

        self.category = Category.objects.create(
            name="Government & Identity",
            slug="government-identity",
            description="Gov services",
            icon_class="bi-card-heading",
            order=1
        )

        self.service = Service.objects.create(
            category=self.category,
            title="PAN Card New",
            slug="pan-card-new",
            short_summary="Apply for PAN",
            description="Detailed description for PAN card",
            required_documents="Aadhaar, Photo",
            homline_charge="₹150",
            third_party_fee="₹107",
            processing_time="2-3 days",
            is_featured=True,
            badge="Popular",
            icon_class="bi-credit-card"
        )

        self.update = Update.objects.create(
            title="Service Launch Notice",
            slug="service-launch-notice",
            category_tag="Service Update",
            summary="New features online",
            content="Full update notice text",
            is_featured=True
        )

        self.plan = MembershipPlan.objects.create(
            name="Basic Member",
            tagline="Essential support",
            price="₹299 / year",
            is_popular=True,
            features="Feature 1\nFeature 2",
            welcome_benefits="Benefit 1",
            order=1
        )

        self.faq = FAQ.objects.create(
            question="What is HOMline?",
            answer="Digital service assistance platform.",
            category="General",
            order=1
        )

        self.review = CustomerReview.objects.create(
            customer_name="Test Customer",
            location="Kochi",
            rating=5,
            service_used="PAN Card",
            review_text="Great service!",
            is_verified=True
        )

        self.service_request = ServiceRequest.objects.create(
            request_id="HOM-2026-TEST",
            full_name="Test User",
            mobile="6282268453",
            email="test@example.com",
            service=self.service,
            requirement_details="Needs PAN card",
            contact_preference="WhatsApp",
            status="Processing",
            admin_notes="Assigned to agent"
        )

    def test_admin_uploaded_document_requires_permission(self):
        staff = get_user_model().objects.create_user(username='staff', password='Safe-test-password-274!', is_staff=True)
        self.client.force_login(staff)
        response = self.client.get(reverse('private_request_document', kwargs={'request_id': self.service_request.request_id}))
        self.assertEqual(response.status_code, 403)

    def test_admin_with_request_view_permission_can_open_private_file_route(self):
        staff = get_user_model().objects.create_user(username='request-viewer', password='Safe-test-password-274!', is_staff=True)
        staff.user_permissions.add(Permission.objects.get(codename='view_servicerequest'))
        self.client.force_login(staff)
        response = self.client.get(reverse('private_request_document', kwargs={'request_id': self.service_request.request_id}))
        self.assertEqual(response.status_code, 404)

    def test_uploaded_documents_are_not_public(self):
        response = self.client.get(reverse('private_request_document', kwargs={'request_id': self.service_request.request_id}))
        self.assertEqual(response.status_code, 302)
        self.assertIn('/login', response.url)

    def test_document_upload_type_and_size_are_validated(self):
        invalid = ServiceRequestForm(data={
            'full_name': 'New Customer',
            'mobile': '6282268453',
            'service': self.service.pk,
            'requirement_details': 'Help with application',
            'contact_preference': 'WhatsApp',
        }, files={'document_upload': SimpleUploadedFile('script.exe', b'bad')})
        self.assertFalse(invalid.is_valid())
        self.assertIn('document_upload', invalid.errors)

    def test_generated_request_ids_have_long_random_suffix(self):
        created = ServiceRequest.objects.create(
            full_name='ID Test', mobile='6282268453', service=self.service,
            requirement_details='ID check'
        )
        self.assertEqual(len(created.request_id.rsplit('-', 1)[-1]), 16)

    # ---- JSON API (replaces the old template view tests) ----
    def test_spa_shell_is_served_for_client_routes(self):
        for path in ['/', '/about', '/services', '/services/pan-card-new', '/track/HOM-2026-TEST', '/panel', '/login']:
            r = self.client.get(path)
            self.assertIn(r.status_code, (200, 503), path)  # 503 only when the frontend bundle is not built
        self.assertEqual(self.client.get('/api/nope/').status_code, 404)

    def test_services_and_detail_api(self):
        data = self.client.get('/api/services/').json()
        self.assertEqual([s['title'] for s in data['services']], ['PAN Card New'])
        self.assertEqual(self.client.get('/api/services/', {'q': 'no-such-service'}).json()['services'], [])
        detail = self.client.get(f'/api/services/{self.service.slug}/').json()['service']
        self.assertEqual((detail['homline_charge'], detail['third_party_fee']), ('₹150', '₹107'))

    def test_track_exposes_no_contact_details_and_fee_breakdown(self):
        self.service_request.service_charge = '₹200.00'
        self.service_request.portal_fee = '₹107.00'
        self.service_request.save()
        data = self.client.get('/api/track/HOM-2026-TEST/').json()
        req = data['request']
        self.assertEqual((req['service_charge'], req['portal_fee']), ('₹200.00', '₹107.00'))
        self.assertIn('api.qrserver.com', data['qr_code_url'])
        for private in ('mobile', 'email', 'requirement_details', 'admin_notes'):
            self.assertNotIn(private, req)
        self.assertTrue(all('description' not in t for t in req['timeline']))

    def test_receipt_requires_verified_access_then_shows_details(self):
        c = APIClient()
        self.assertEqual(c.get('/api/receipt/HOM-2026-TEST/').status_code, 403)
        c.get('/api/track/HOM-2026-TEST/')  # tracking verifies this browser session
        r = c.get('/api/receipt/HOM-2026-TEST/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['request']['mobile'], '6282268453')

    def test_membership_lookup_ignores_mobile_and_masks_phone(self):
        from core.models import MembershipEnquiry
        MembershipEnquiry.objects.create(name='A', mobile='9876543210', membership_code='HOM-MBR-2026-AAAAAAAAAA', status='Active')
        self.assertEqual(self.client.get('/api/membership/', {'code': '9876543210'}).status_code, 404)
        r = self.client.get('/api/membership/', {'code': 'HOM-MBR-2026-AAAAAAAAAA'})
        self.assertEqual(r.json()['masked_mobile'], '******3210')
        self.assertNotIn('9876543210', r.content.decode())

    def test_membership_card(self):
        from core.models import MembershipEnquiry
        MembershipEnquiry.objects.create(name='Joseph Paul', mobile='9447112233', place='Kochi', preferred_plan=self.plan,
                                         status='Active', membership_code='HOM-MBR-2026-TEST')
        data = self.client.get('/api/membership/card/HOM-MBR-2026-TEST/').json()
        self.assertEqual((data['name'], data['plan']), ('Joseph Paul', 'Basic Member'))
        self.assertNotIn('9447112233', str(data))

    def test_logout_is_post_only(self):
        self.assertEqual(self.client.get('/api/auth/logout/').status_code, 405)

    def test_admin_logout_terminates_session_and_blocks_panel_access(self):
        User = get_user_model()
        User.objects.create_user('adminuser', password='AdminPassword123!', is_staff=True, is_superuser=True)
        c = APIClient()
        # 1. Admin login
        login_res = c.post('/api/auth/login/', {'username': 'adminuser', 'password': 'AdminPassword123!'}, format='json')
        self.assertEqual(login_res.status_code, 200)
        self.assertEqual(login_res.json()['user']['role'], 'admin')

        # 2. Access panel endpoints while authenticated
        meta_res = c.get('/api/panel/meta/')
        self.assertEqual(meta_res.status_code, 200)
        self.assertIn('no-store', meta_res.get('Cache-Control', ''))

        # 3. Logout
        logout_res = c.post('/api/auth/logout/')
        self.assertEqual(logout_res.status_code, 200)
        self.assertTrue(logout_res.json().get('ok'))
        self.assertEqual(logout_res.json().get('message'), 'Logged out successfully.')
        self.assertIn('no-store', logout_res.get('Cache-Control', ''))
        if settings.SESSION_COOKIE_NAME in logout_res.cookies:
            self.assertEqual(logout_res.cookies[settings.SESSION_COOKIE_NAME]['max-age'], 0)

        # 4. Subsequent access to panel endpoints is forbidden
        self.assertEqual(c.get('/api/panel/meta/').status_code, 403)
        self.assertEqual(c.get('/api/panel/overview/').status_code, 403)
        self.assertEqual(c.get('/api/auth/me/').status_code, 403)

        # 5. Bootstrap returns no authenticated user (refreshing page state)
        boot_res = c.get('/api/bootstrap/')
        self.assertEqual(boot_res.status_code, 200)
        self.assertIsNone(boot_res.json()['user'])

        # 6. Admin can log in again normally
        relogin_res = c.post('/api/auth/login/', {'username': 'adminuser', 'password': 'AdminPassword123!'}, format='json')
        self.assertEqual(relogin_res.status_code, 200)
        self.assertEqual(relogin_res.json()['user']['role'], 'admin')
        self.assertEqual(c.get('/api/panel/meta/').status_code, 200)

    def test_contact_enquiry_is_saved(self):
        r = APIClient().post('/api/contact/', {'name': 'New Enquiry', 'mobile': '6282268453', 'message': 'Please call me about PAN assistance.'}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertTrue(ContactEnquiry.objects.filter(name='New Enquiry').exists())

    def test_service_request_submission_creates_timeline(self):
        r = APIClient().post('/api/requests/', {
            'full_name': 'New Customer', 'mobile': '6282268453', 'service': self.service.pk,
            'requirement_details': 'Please help with a PAN application.', 'contact_preference': 'WhatsApp'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        created = ServiceRequest.objects.get(full_name='New Customer')
        self.assertEqual(created.request_id, r.json()['request_id'])
        self.assertEqual((created.service_charge, created.portal_fee), ('₹150', '₹107'))
        self.assertTrue(ServiceRequestLog.objects.filter(request=created, status='Pending').exists())

    def test_pwd_request_submission(self):
        from core.models import PwDRequest
        r = APIClient().post('/api/pwd/', {
            'name': 'Ramesh Kumar', 'mobile': '9847123456', 'place': 'Aluva', 'assistance_type': 'Doorstep Visit Assistance',
            'service_needed': 'Disability Certificate Renewal', 'details': 'Wheelchair user, needs assistance at residence.'}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertTrue(PwDRequest.objects.filter(name='Ramesh Kumar').exists())

    def test_complaint_suggestion_submission(self):
        from core.models import ComplaintSuggestion
        c = APIClient()
        r = c.post('/api/complaints/', {
            'entry_type': 'Suggestion', 'name': 'Anu Thomas', 'mobile': '9847654321', 'email': 'anu@example.com',
            'subject': 'Add more DTP font options', 'details': 'Please add stylish Malayalam Unicode fonts.',
            'consent': True, 'acknowledge': True}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        obj = ComplaintSuggestion.objects.get(name='Anu Thomas')
        self.assertRegex(obj.reference_no, r'^HOM-CMP-\d{8}-001$')
        self.assertEqual(obj.status, 'Received')
        self.assertEqual(c.get(f'/api/complaints/received/{obj.reference_no}/').json()['reference_no'], obj.reference_no)

    def test_complaint_requires_consent(self):
        from core.models import ComplaintSuggestion
        r = APIClient().post('/api/complaints/', {'entry_type': 'Accessibility Concern', 'name': 'Anu', 'mobile': '9847654321',
                                                  'subject': 'Ramp missing', 'details': 'No ramp at the desk.'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Please confirm the declaration', r.json()['errors']['consent'][0])
        self.assertFalse(ComplaintSuggestion.objects.exists())

    def test_complaint_received_needs_own_session(self):
        from core.models import ComplaintSuggestion
        obj = ComplaintSuggestion.objects.create(name='A', mobile='9847654321', subject='s', details='d')
        self.assertEqual(APIClient().get(f'/api/complaints/received/{obj.reference_no}/').status_code, 403)

    def test_user_signup_login_logout_flow(self):
        c = APIClient()
        r = c.post('/api/auth/signup/', {'full_name': 'Meera Krishnan', 'username': 'meerak', 'email': 'meera@example.com',
                                         'password': 'SecurePassword123!', 'confirm_password': 'SecurePassword123!'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        user = get_user_model().objects.get(username='meerak')
        self.assertEqual((user.is_staff, user.is_superuser, user.first_name), (False, False, 'Meera Krishnan'))
        self.assertEqual(c.get('/api/auth/me/').json()['user']['username'], 'meerak')
        self.assertEqual(c.post('/api/auth/logout/').status_code, 200)
        self.assertEqual(c.get('/api/auth/me/').status_code, 403)
        r = c.post('/api/auth/login/', {'username': 'meera@example.com', 'password': 'SecurePassword123!', 'remember_me': True}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_signup_cannot_escalate_privileges(self):
        r = APIClient().post('/api/auth/signup/', {'full_name': 'X', 'username': 'sneaky', 'email': 's@example.com', 'password': 'SecurePassword123!',
                                                   'confirm_password': 'SecurePassword123!', 'is_staff': True, 'is_superuser': True}, format='json')
        self.assertEqual(r.status_code, 201)
        u = get_user_model().objects.get(username='sneaky')
        self.assertFalse(u.is_staff or u.is_superuser)

    def test_dashboard_requires_login(self):
        self.assertEqual(APIClient().get('/api/me/dashboard/').status_code, 403)

    def test_dashboard_authenticated_and_profile_actions(self):
        user = get_user_model().objects.create_user(username='arjun_client', email='arjun@example.com',
                                                    password='InitialPassword123!', first_name='Arjun Nair')
        c = APIClient()
        c.force_authenticate(user)
        sr = ServiceRequest.objects.create(user=user, service=self.service, full_name='Arjun Nair', mobile='9846123456',
                                           email='arjun@example.com', requirement_details='Need PAN application assistance')
        dash = c.get('/api/me/dashboard/').json()
        self.assertEqual([r['request_id'] for r in dash['requests']], [sr.request_id])
        self.assertEqual(dash['counts']['total'], 1)

        r = c.patch('/api/auth/me/', {'first_name': 'Arjun V. Nair', 'email': 'arjun.updated@example.com'}, format='json')
        self.assertEqual(r.status_code, 200)
        user.refresh_from_db()
        self.assertEqual((user.first_name, user.email), ('Arjun V. Nair', 'arjun.updated@example.com'))

        r = c.post('/api/auth/password/', {'old_password': 'InitialPassword123!', 'new_password1': 'UpdatedSecret456#',
                                           'new_password2': 'UpdatedSecret456#'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        user.refresh_from_db()
        self.assertTrue(user.check_password('UpdatedSecret456#'))

        offline = ServiceRequest.objects.create(service=self.service, full_name='Walk-in', mobile='9000000000', requirement_details='Offline')
        self.assertEqual(c.post('/api/me/link-request/', {'request_id': offline.request_id}, format='json').status_code, 200)
        offline.refresh_from_db()
        self.assertEqual(offline.user, user)
        other = get_user_model().objects.create_user(username='other', password='x')
        c.force_authenticate(other)
        self.assertEqual(c.post('/api/me/link-request/', {'request_id': offline.request_id}, format='json').status_code, 400)
