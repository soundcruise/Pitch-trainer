from PIL import Image

def make_full_bleed(input_path, output_path, scale_factor=1.12):
    img = Image.open(input_path).convert("RGBA")
    
    # Create a base dark background to fill any transparent areas
    bg = Image.new("RGBA", img.size, (18, 18, 18, 255))
    bg.paste(img, (0, 0), img)
    
    # Scale up and center crop to remove rounded corners completely
    w, h = bg.size
    new_w = int(w * scale_factor)
    new_h = int(h * scale_factor)
    scaled = bg.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    left = (new_w - w) // 2
    top = (new_h - h) // 2
    right = left + w
    bottom = top + h
    
    cropped = scaled.crop((left, top, right, bottom))
    
    # Convert back to RGB to save as solid PNG without alpha channel
    final = cropped.convert("RGB")
    final.save(output_path)
    print(f"Saved full bleed icon to {output_path}")

if __name__ == "__main__":
    make_full_bleed(
        "/Users/murakamimasakuni/Desktop/Antigravity/pitch_trainer/icon_idea/Pro.png",
        "/Users/murakamimasakuni/Desktop/Antigravity/pitch_trainer/icon_idea/Pro_2.png"
    )
