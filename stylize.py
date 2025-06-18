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
                    "A warm, cozy group portrait in the style of a Studio Ghibli film still by Hayao Miyazaki: "
                    "soft, hand-drawn ink outlines and watercolor brush textures, gentle pastel "
                    "and muted earth-tone palette, cinematic composition with warm sunset lighting and light film-grain. "
                    "Preserve every person's original facial features, eye shape/color, hair style/color, skin tones, and the restaurant background "
                    "exactly as in the source photo"
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
