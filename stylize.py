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
                    "A warm and whimsical group portrait in the artistic style of a Studio Ghibli film directed by Hayao Miyazaki. "
                    "Reimagine only the original people in the image — do not add, duplicate, or invent any extra characters. "
                    "Preserve the number, position, and identity of all people exactly. Stylize them with expressive Ghibli-style features: "
                    "large, soulful eyes, gentle blush on cheeks, and flowing, hand-drawn hair. Use clean line art, watercolor textures, and a "
                    "pastel + earth-tone palette. Loosely stylize the background, adding cozy light and a film-grain finish. "
                    "Absolutely avoid blur or distortion. Keep the emotional warmth and storytelling charm of a Ghibli scene."
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
