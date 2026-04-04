import json
import re
from pathlib import Path

def extract_json_from_markdown(raw_string):
    """
    The JSON files contain a markdown string with an embedded ```json ... ``` block.
    This extracts and parses that embedded JSON.
    """
    match = re.search(r'```json\s*(\{.*?\})\s*```', raw_string, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    return None

def get_name(data):
    identity = data.get('Identity', {})
    return (
        identity.get('official_name')
        or identity.get('Official_Name')
        or identity.get('name')
        or 'Unknown'
    )

def load_and_normalize(json_path):
    """
    Loads a JSON file. If the contents are a raw markdown string,
    extracts the embedded JSON and rewrites the file as clean JSON.
    """
    with open(json_path, 'r') as f:
        raw = json.load(f)

    if not isinstance(raw, str):
        return raw  # Already clean

    data = extract_json_from_markdown(raw)
    if data is None:
        return None

    with open(json_path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[AUTO-FIX] Extracted and rewrote clean JSON: {json_path.name}")
    return data

def parse_accessibility_to_3d(json_path):
    """
    Reads a location JSON and triggers 'Map Events'
    based on accessibility data.
    """
    data = load_and_normalize(json_path)
    if data is None:
        print(f"--- ⚠️ Could not extract structured JSON from: {json_path} ---\n")
        return

    print(f"--- 🛠️ Processing 3D Features for: {get_name(data)} ---")

    physical = data.get('Physical_Access', {})
    sensory = data.get('Sensory_Environment', {})

    # Logic 1: Vertical Navigation (Elevator Highlighting)
    # Search the entire Physical_Access subtree for elevator references
    if "elevator" in str(physical).lower() or "lift" in str(physical).lower():
        print("[MAP ACTION] ⬆️ HIGHLIGHT: Elevator shaft glowing in BLUE.")
        print(f"Reason: Elevator/lift detected in physical access data.")

    # Logic 2: Sensory Heatmapping (Noise Sphere)
    # Search the entire Sensory_Environment subtree for loud/crowded keywords
    sensory_str = str(sensory).lower()
    if "loud" in sensory_str or "crowded" in sensory_str:
        print("[MAP ACTION] 🔴 ADD_OBJECT: Red translucent sphere at coordinates.")
        print(f"Reason: High noise/stimulus detected in sensory data.")

    # Logic 3: Entry Verification
    # Check for any entrance photo URL anywhere in Navigation_Assets
    nav = data.get('Navigation_Assets', {})
    if "entrance" in str(nav).lower() or "photo" in str(nav).lower():
        print(f"[MAP ACTION] 🖼️ BIND_TEXTURE: Image linked to entrance pin.")

    print("--- Parser Finished ---\n")

# Process all location JSON files
locations_dir = Path(__file__).parent / "data" / "locations"
for json_file in sorted(locations_dir.glob("*.json")):
    parse_accessibility_to_3d(json_file)