import sys
from PIL import Image

def process_icon(input_path, output_path, reference_path=None):
    try:
        img = Image.open(input_path).convert("RGBA")
        print(f"Original size: {img.size}")
        
        # If user wants no white borders, it might be due to transparent/rounded corners
        # Being filled with white. normal_2.png is likely a full bleed square.
        # Let's check the bounding box of non-transparent pixels and crop/resize it 
        # to fill the square perfectly.
        
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        # Find alpha bounding box
        bbox = img.getbbox()
        if bbox:
            print(f"Bounding box: {bbox}")
            cropped = img.crop(bbox)
            # resize back to square without maintaining aspect ratio if it's very close, 
            # but better to padding or scale up to fill.
            # To ensure no white borders on iOS, the icon must be a solid square without transparent pixels.
            # Let's scale it so that the non-transparent part fills the canvas.
            
            # Actually, the user wants "周りに白い縁などが出来ないように調整(通常盤のアイコンでやったように)".
            # Let's inspect normal_2.png's size and mode
            
            if reference_path:
                ref = Image.open(reference_path)
                print(f"Reference size: {ref.size}, mode: {ref.mode}")
                
                # Assume ref is a full square. We can just resize cropped to ref size.
                desired_size = ref.size
            else:
                desired_size = img.size
                
            # If the image was originally a rounded rectangle with transparency, 
            # we want to crop out the transparent corners. This means taking a center crop 
            # that fits within the inner opaque area.
            # However, looking at Pro.png, it might just need to have transparency removed 
            # by composite over black or its dominant background color, OR we just scale the center.
            pass
            
            # Let's just output the mode and sizes first so the agent can plan the crop.
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    process_icon(
        "/Users/murakamimasakuni/Desktop/Antigravity/pitch_trainer/icon_idea/Pro.png",
        "/Users/murakamimasakuni/Desktop/Antigravity/pitch_trainer/icon_idea/Pro_2.png",
        "/Users/murakamimasakuni/Desktop/Antigravity/pitch_trainer/icon_idea/normal_2.png"
    )
