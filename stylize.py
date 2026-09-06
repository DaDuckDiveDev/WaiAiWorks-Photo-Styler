import replicate
import os
import uuid
import requests
import time
import json

REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
client = replicate.Client(api_token=REPLICATE_API_TOKEN)

def stylize_image(image_url, style):
    started_at = time.monotonic()
    request_id = uuid.uuid4().hex
    try:
        if style == "anime":
            prompt = (
                "A warm and whimsical group portrait in the artistic style of a Studio Ghibli film directed by Hayao Miyazaki. "
                "Reimagine only the original people in the image — do not add, duplicate, or invent any extra characters. "
                "Preserve the number, position, and identity of all people exactly. Stylize them with expressive Ghibli-style features: "
                "large, soulful eyes, gentle blush on cheeks, and flowing, hand-drawn hair. Use clean line art, watercolor textures, and a "
                "pastel + earth-tone palette. Loosely stylize the background, adding cozy light and a film-grain finish. "
                "Absolutely avoid blur or distortion. Keep the emotional warmth and storytelling charm of a Ghibli scene."
            )
        elif style == "pixar":
            prompt = (
                "Turn this photo into a Pixar-style 3D animated character portrait. "
                "Keep all the original people in the image — do not add, remove, or duplicate any individuals. "
                "Preserve each person's facial features, skin tone, hair style, and expression. "
                "Use soft lighting, detailed Pixar-style textures, large expressive eyes, and a vibrant color palette. "
                "The style should resemble a modern Pixar movie, with cinematic depth-of-field, emotional warmth, "
                "and a playful, heartwarming feel."
            )
        elif style == "comic":
            prompt = (
                "A dramatic, high-contrast comic book illustration of the original people in the photo. "
                "do not add, remove, or duplicate any individuals. "
                "Maintain all facial features, skin tones, and body positions exactly. "
                "Apply bold black ink outlines, vibrant cel-shaded coloring, and halftone texture details. "
                "Use sharp lighting and stylized shadows to create dynamic comic panel energy. "
                "Background should be simplified with action-line or comic blur effects. "
                "Avoid blur or smudging — keep linework clean and colors poppy like classic Marvel/DC comics."
            )
        elif style == "disney":
            prompt = (
                "Transform this photo into the elegant and dreamy style of a Disney animated princess movie. "
                "Keep all original people and preserve their facial features, skin tone, and expressions. "
                "do not add, remove, or duplicate any individuals. "
                "Use soft glowing light, gentle watercolor-style shading, and flowing outlines. "
                "Add pastel color palettes and romantic fantasy atmosphere typical of Disney princess films. "
                "Do not add any new characters or distort the original ones."
            )    
        else:
            raise ValueError("Unsupported style")

        output_url = client.run(
            "black-forest-labs/flux-kontext-pro",
            input={
                "prompt": prompt,
                "input_image": image_url,
                "aspect_ratio": "match_input_image",
                "output_format": "jpg",
                "safety_tolerance": 2
            }
        )

        generated_at = time.monotonic()
        print(json.dumps({"event": "stylize_generated", "request_id": request_id,
                          "style": style, "provider_wait_seconds": round(generated_at - started_at, 3)}), flush=True)
        output_path = os.path.join("static", "outputs", f"{uuid.uuid4()}.jpg")
        response = requests.get(str(output_url), timeout=(10, 60))
        response.raise_for_status()
        img_data = response.content
        with open(output_path, "wb") as f:
            f.write(img_data)
        print(json.dumps({"event": "stylize_completed", "request_id": request_id,
                          "download_seconds": round(time.monotonic() - generated_at, 3),
                          "total_seconds": round(time.monotonic() - started_at, 3)}), flush=True)
        return output_path

    except Exception as e:
        print(f"Error in stylize_image: {e}")
        return None
