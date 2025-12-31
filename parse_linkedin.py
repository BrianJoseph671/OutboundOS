import sys
import json
from linkedin_pdf_extractor import extract_linkedin_profile

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: parse_linkedin.py <pdf_path>"}), file=sys.stderr)
        sys.exit(1)
    
    try:
        result = extract_linkedin_profile(sys.argv[1])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
