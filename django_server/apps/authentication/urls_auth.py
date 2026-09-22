from django.urls import path
from .views import RequestOTPView, VerifyOTPView

urlpatterns = [
    path('request-otp', RequestOTPView.as_view(), name='auth-request-otp'),
    path('verify-otp', VerifyOTPView.as_view(), name='auth-verify-otp'),
]

