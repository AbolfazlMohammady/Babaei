from django.urls import path

from .views import DesignerPageView, SaveDesignView, UploadArtworkView

app_name = "customizer"

urlpatterns = [
    path("design/<slug:slug>/", DesignerPageView.as_view(), name="designer"),
    path("design/<slug:slug>/save/", SaveDesignView.as_view(), name="save_design"),
    path("design/<slug:slug>/upload/", UploadArtworkView.as_view(), name="upload_artwork"),
]
