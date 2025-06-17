import replicate
import os
import uuid

REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
client = replicate.Client(api_token=REPLICATE_API_TOKEN)

def stylize_image(image_path):
    with open(image_path, "rb") as img_file:
        output_url = client.run(
            "sczhou/t2i-adapter-cartoon",
            input={
                "image": img_file,
                "scale": 1.0,
                "adapter_conditioning_scale": 0.7,
                "prompt": "Studio Ghibli-style cartoon of the uploaded photo, preserving original facial features, skin tone, background, adults and children."
            }
        )
    output_path = os.path.join("outputs", f"{uuid.uuid4()}.jpg")
    import requests
    img_data = requests.get(output_url).content
    with open(output_path, "wb") as f:
        f.write(img_data)
    return output_path
