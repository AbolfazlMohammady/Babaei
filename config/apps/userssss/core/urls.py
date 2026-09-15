from django.urls import path, include


urlpatterns = [
    # Autenticate
    path('',include('apps.users.auth.urls')),


    # Profile User
    path('',include('apps.users.user_profile.urls')),


    # User Manager
    path('manager/',include('apps.users.manager.urls')),
]
