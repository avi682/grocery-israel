import os
import shutil
import random
import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore
from il_supermarket_scarper import ScarpingTask
from il_supermarket_parsers import ConvertingTask

# --- Configuration ---
ITEM_LIMIT_PER_RUN = 3500
BATCH_SIZE = 500
DUMPS_DIR = "dumps"
OUTPUTS_DIR = "outputs"

# Hebrew Chain Names for Firestore
CHAIN_NAME_MAPPING = {
    "SHUFERSAL": "שופרסל",
    "RAMI_LEVY": "רמי לוי",
    "OSHER_AD": "אושר עד"
}

# Path to your Firebase service account key
# UPDATE THIS PATH to your actual .json key file
SERVICE_ACCOUNT_KEY = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "groceryisrael-firebase-adminsdk-fbsvc-5046262c9f.json")

def cleanup():
    """Removes temporary folders to save space."""
    for folder in [DUMPS_DIR, OUTPUTS_DIR]:
        if os.path.exists(folder):
            print(f"Cleaning up {folder}...")
            shutil.rmtree(folder)

def main():
    # 1. Initialize Firebase
    if not os.path.exists(SERVICE_ACCOUNT_KEY):
        print(f"ERROR: Service account key not found at {SERVICE_ACCOUNT_KEY}")
        print("Please set FIREBASE_SERVICE_ACCOUNT_KEY environment variable or place serviceAccountKey.json in the root.")
        return

    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    try:
        # 2. Scraping: Download latest XMLs
        print("Step 1: Scraping latest price files...")
        scraper = ScarpingTask(
            enabled_scrapers=list(CHAIN_NAME_MAPPING.keys()),
            files_types=["PRICE_FILE", "PRICE_FULL_FILE"],
            limit=2, # Get a bit more variety
            suppress_exception=True # Don't crash if one fails
        )
        try:
            scraper.start() # Downloads to 'dumps/'
        except Exception as e:
            if "No files to download" in str(e):
                print("Note: Some files were not found for some chains, continuing with what we have.")
            else:
                raise e

        # 3. Parsing: Convert XML to CSV
        print("Step 2: Parsing XML files to CSV...")
        parser = ConvertingTask(data_folder=DUMPS_DIR)
        parser.run() # Outputs to 'outputs/'

        # 4. Data Processing with Pandas
        print("Step 3: Processing and merging data...")
        all_items = []

        if not os.path.exists(OUTPUTS_DIR):
            print("ERROR: Parsing failed, outputs folder not found.")
            return

        # Iterate through subfolders in outputs/ (usually one per chain)
        for chain_folder in os.listdir(OUTPUTS_DIR):
            chain_path = os.path.join(OUTPUTS_DIR, chain_folder)
            if not os.path.isdir(chain_path):
                continue

            # Look for CSV files (usually named after the chain)
            for file in os.listdir(chain_path):
                if file.endswith(".csv"):
                    csv_path = os.path.join(chain_path, file)
                    print(f"Loading {csv_path}...")
                    
                    df = pd.read_csv(csv_path)
                    
                    # Core logic: Filter and map
                    # Column names might vary slightly by parser, but usually:
                    # 'ItemCode', 'ItemName', 'ItemPrice', 'ManufacturerName'
                    
                    # Normalize columns if needed (based on typical il-supermarket-parsers output)
                    df = df.rename(columns={
                        'ItemCode': 'barcode',
                        'ItemName': 'name',
                        'ItemPrice': 'price',
                        'ManufacturerName': 'brand'
                    })

                    # Drop invalid data
                    df = df.dropna(subset=['barcode', 'price'])
                    df = df[df['price'] > 0]
                    
                    # Map chain name
                    chain_id = chain_folder.upper()
                    heb_chain_name = CHAIN_NAME_MAPPING.get(chain_id, chain_id)

                    for _, row in df.iterrows():
                        all_items.append({
                            'barcode': str(row['barcode']).split('.')[0], # Avoid .0 from float conversion
                            'name': str(row['name']).strip(),
                            'brand': str(row.get('brand', 'Unknown')).strip(),
                            'price': float(row['price']),
                            'chain': heb_chain_name
                        })

        if not all_items:
            print("No valid items found to upload.")
            return

        # 5. Shuffling and Limiting (Match Node.js behavior)
        print(f"Total items discovered: {len(all_items)}")
        random.shuffle(all_items)
        upload_queue = all_items[:ITEM_LIMIT_PER_RUN]
        print(f"Limiting to {len(upload_queue)} items for this run.")

        # 6. Batched Firestore Upload
        print(f"Step 4: Uploading to Firestore in batches of {BATCH_SIZE}...")
        
        batch = db.batch()
        count = 0
        total_uploaded = 0

        for item in upload_queue:
            doc_ref = db.collection("master_catalog").document(item['barcode'])
            
            # Use merge=True behavior (set with merge in Python)
            data = {
                "name": item['name'],
                "brand": item['brand'],
                "updated_at": firestore.SERVER_TIMESTAMP,
                "prices": {
                    item['chain']: item['price']
                }
            }
            
            batch.set(doc_ref, data, merge=True)
            count += 1
            
            if count >= BATCH_SIZE:
                batch.commit()
                total_uploaded += count
                print(f"Uploaded {total_uploaded} items...")
                batch = db.batch()
                count = 0
                
        if count > 0:
            batch.commit()
            total_uploaded += count
            print(f"Final batch uploaded. Total: {total_uploaded}")

        print("Migration task completed successfully.")

    except Exception as e:
        print(f"CRITICAL ERROR during execution: {e}")
    finally:
        cleanup()

if __name__ == "__main__":
    main()
