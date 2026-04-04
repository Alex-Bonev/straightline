import asyncio
import json
import os
import re
from pathlib import Path
from browser_use_sdk.v3 import AsyncBrowserUse
from dotenv import load_dotenv

load_dotenv()

# --- STEP 2: STORAGE SETUP ---
DATA_DIR = Path("data/locations")
DATA_DIR.mkdir(parents=True, exist_ok=True) 

def slugify(text):
    """convert place name into json file name"""
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

async def scrape_location_regulations(target_location):
    client = AsyncBrowserUse() 
    
    # Keeping your strong task exactly as it is
    location_task = f"""
    Comprehensive Accessibility & Navigation Audit for: '{target_location}'

    Perform a deep-dive scrape of Google Maps, Yelp, the official website, and HHS/ADA portals. 
    Extract the following for a 3D-navigation app:

    1. IDENTITY & EXTERIOR:
       - Official Name, Address, Phone, and Website.
       - Direct URL to a high-res photo of the BUILDING ENTRANCE.
       - Is there a 'Drop-off' zone or 'Handicap Parking' visible in photos/reviews?

    2. PHYSICAL ACCESS (Micro-Details):
       - Search for 'stairs', 'steps', 'threshold', 'curb', or 'heavy doors'.
       - Confirm if the entrance has 'Automatic Doors' or a 'Push Button'.
       - Verify if the clinic is on the 'Ground Floor' or requires an 'Elevator/Lift'.

    3. SENSORY & ENVIRONMENT:
       - Search reviews for keywords: 'loud', 'bright', 'crowded', 'waiting time', or 'quiet'.
       - Current temperature, humidity, and 'Wind Speed' (crucial for lightweight wheelchair stability).
       - Current 'Pollen/Air Quality' index (for respiratory/autoimmune sensitivities).

    4. REGULATORY & TRUST:
       - HIPAA: Search HHS OCR portal for specific breach history.
       - ADA: Search for any past accessibility lawsuits or 'settlement agreements' involving this location.

    5. NAVIGATION LINKS:
       - Google Maps Place ID and CID (for deep-linking 3D pins).
       - Links to the 'Photos' tab specifically filtered for 'Exterior' or 'Street View'.

    Return a strictly formatted JSON object with nested categories: 
    'Identity', 'Physical_Access', 'Sensory_Environment', 'Regulatory', and 'Navigation_Assets'.
    """

    print(f"🚀 Starting Cloud Agent for UCSD Location: {target_location}...")
    
    try:
        result = await client.run(task=location_task)
        
        file_name = f"{slugify(target_location)}.json"
        file_path = DATA_DIR / file_name
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(result.output, f, indent=4)
            
        print(f"✅ Success! Data saved to: {file_path}")
        
    except Exception as e:
        print(f"❌ Cloud Task Failed for {target_location}: {e}")

if __name__ == "__main__":
    # --- CHANGE NAMES HERE ---
    # You can do one at a time:
    # campus_place = "Geisel Library UCSD"
    
    # Or even better, loop through a few to build your 3D map data faster:
    places = [
        # "Geisel Library UCSD",
        # "Price Center UCSD",
        # "WongAvery Library UCSD",
        # "Canyon Vista Marketplace UCSD"
        "Warren Residential Halls UCSD"
    ]
    
    for place in places:
        asyncio.run(scrape_location_regulations(place))