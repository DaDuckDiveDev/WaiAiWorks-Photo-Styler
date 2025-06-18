import replicate
import os
import uuid
import requests

REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
client = replicate.Client(api_token=REPLICATE_API_TOKEN)

def stylize_image(image_url):
    try:
        output_url = client.run(
            "black-forest-labs/flux-kontext-pro",
            input={
                "prompt": (
                    "Studio Ghibli-style cartoon of the uploaded photo, "
                    "preserving original facial features, skin tone, background, "
                    "adults and children."
                ),
                "input_image": image_url,
                "aspect_ratio": "match_input_image",
                "output_format": "jpg",
                "safety_tolerance": 2
            }
        )

        output_path = os.path.join("outputs", f"{uuid.uuid4()}.jpg")
        img_data = requests.get(output_url).content
        with open(output_path, "wb") as f:
            f.write(img_data)

        return output_path
    except Exception as e:
        print(f"Error in stylize_image: {e}")
        return None
