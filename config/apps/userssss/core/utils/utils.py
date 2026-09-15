import  uuid
from pathlib import Path 



def path_image_or_file_user_profile(instance,filename):

    return f'uploads/user/{instance.uuid}/{filename}'
    


# def user_image_path(instance, filename):
#     extension = Path(filename).suffix.lower()
#     filename = f"{uuid.uuid4().hex}{extension}"

#     return f"uploads/users/{instance.uuid}/profile/{filename}"