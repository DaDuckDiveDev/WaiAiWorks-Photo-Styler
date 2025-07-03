import replicate
import os
import uuid
import requests

REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
client = replicate.Client(api_token=REPLICATE_API_TOKEN)

def stylize_image(image_url, style):
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
                "Transform this photo into a Pixar-style 3D animated character portrait. Reimagine only the original people in the image — "
                "do not add or invent new characters. Preserve facial features, skin tone, hairstyle, and expression. "
                "Use large expressive eyes, detailed Pixar-style skin and hair textures, soft global lighting, and a vibrant, cinematic color palette. "
                "The result should feel like a still frame from a modern Pixar film — playful, heartwarming, and emotionally rich."
            )
        elif style == "comic":
            prompt = (
                "A dramatic, high-contrast comic book illustration of the original people in the photo. "
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

        output_path = os.path.join("static", "outputs", f"{uuid.uuid4()}.jpg")
        img_data = requests.get(output_url).content
        with open(output_path, "wb") as f:
            f.write(img_data)
        return output_path

    except Exception as e:
        print(f"Error in stylize_image: {e}")
        return None
