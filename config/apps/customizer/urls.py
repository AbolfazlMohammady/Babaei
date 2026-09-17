from django.urls import path

from .views import DesignerPageView, PrepareProduct3DView, Product3DStatusView, SaveDesignView, UploadArtworkView

app_name = "customizer"

urlpatterns = [
    path("design/<str:slug>/", DesignerPageView.as_view(), name="designer"),
    path("design/<str:slug>/3d/prepare/", PrepareProduct3DView.as_view(), name="prepare_3d"),
    path("design/<str:slug>/3d/status/", Product3DStatusView.as_view(), name="3d_status"),
    path("design/<str:slug>/save/", SaveDesignView.as_view(), name="save_design"),
    path("design/<str:slug>/upload/", UploadArtworkView.as_view(), name="upload_artwork"),
]
