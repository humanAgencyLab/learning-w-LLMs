import os
import requests
import json
import time
import urllib.request
import re

base_dir = "/Users/nibir/Documents/Research/Literature_Review_Papers"

papers = {
    "Theme_A_LLM_Tutoring_Systems": [
        {"title": "LearnMate", "doi": "10.1145/3706599.3719857", "arxiv": "2503.13340"},
        {"title": "AutoPBL", "doi": "10.1145/3706598.3714261", "arxiv": None},
        {"title": "SocraticAI", "doi": "10.48550/arXiv.2512.03501", "arxiv": "2512.03501"},
        {"title": "CodeAid", "doi": "10.1145/3613904.3642398", "arxiv": "2308.10712"}, # Assuming likely arxiv
        {"title": "Evaluating_effectiveness_LLMs", "doi": "10.1145/3657604.3662036", "arxiv": None},
        {"title": "The_Socratic_Turn_in_AI", "doi": "10.1109/IISA66859.2025.11311184", "arxiv": None}
    ],
    "Theme_B_SRL_Frameworks": [
        {"title": "SRL_Framework_Prasad", "doi": "10.1145/3626252.3630828", "arxiv": None},
        {"title": "Turning_Real-Time_Analytics", "doi": "10.1145/3706468.3706559", "arxiv": None}
    ],
    "Theme_C_Appropriate_Reliance_Trust": [
        {"title": "To_Rely_or_Not_to_Rely", "doi": "10.48550/arXiv.2412.15584", "arxiv": "2412.15584"},
        {"title": "AI_Knows_Best_Paradox_of_Expertise", "doi": "10.1145/3785022.3785035", "arxiv": "2509.16772"},
        {"title": "Im_Not_Sure_But", "doi": "10.1145/3630106.3659020", "arxiv": None},
        {"title": "Disclosures_and_Disclaimers", "doi": "10.1609/hcomp.v12i1.31597", "arxiv": None}
    ],
    "Theme_D_AI_Risks_Novices": [
        {"title": "The_Widening_Gap", "doi": "10.1145/3632620.3671116", "arxiv": None},
        {"title": "Fostering_Responsible_AI_Use", "doi": "10.1145/3724363.3729067", "arxiv": None}
    ],
    "Theme_E_Sociotechnical_Governance": [
        {"title": "How_Do_People_Perceive", "doi": "10.1145/3489410.3489416", "arxiv": None},
        {"title": "Learning_in_the_Age_of_LLMs", "doi": None, "arxiv": None},
        {"title": "Formative_Assessment_AI", "doi": None, "arxiv": None}
    ],
    "Theme_F_Why_EitL_is_Necessary": [
        {"title": "AI_Unreliable_Answers", "doi": "10.1007/978-3-031-35894-4_2", "arxiv": None},
        {"title": "From_Concerns_to_Benefits", "doi": "10.1186/s41239-024-00471-4", "arxiv": None},
        {"title": "Dont_Forget_the_Teachers", "doi": "10.1145/3706598.3713210", "arxiv": "2502.14592"},
        {"title": "ChatGPT_vs_Search", "doi": "10.14309/01.ajg.0000931318.66674.61", "arxiv": None},
        {"title": "STAIG_2025_Workshop", "doi": None, "arxiv": None},
        {"title": "EU_AI_Act", "doi": None, "arxiv": None}
    ]
}

def get_unpaywall_url(doi):
    if not doi:
        return None
    try:
        url = f"https://api.unpaywall.org/v2/{doi}?email=hello@example.com"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data.get('best_oa_location') and data['best_oa_location'].get('url_for_pdf'):
                return data['best_oa_location']['url_for_pdf']
    except Exception as e:
        pass
    return None

def download_pdf(url, filepath):
    try:
        # User-agent to avoid 403s
        headers = {'User-Agent': 'Mozilla/5.0'}
        r = requests.get(url, headers=headers, stream=True, timeout=15)
        if r.status_code == 200 and 'pdf' in r.headers.get('Content-Type', '').lower():
            with open(filepath, 'wb') as f:
                for chunk in r.iter_content(chunk_size=1024):
                    if chunk:
                        f.write(chunk)
            return True
        elif r.status_code == 200:
             # Often happens if OA location is an HTML landing page
             pass
    except Exception as e:
        pass
    return False

failed_downloads = []

for folder, folder_papers in papers.items():
    print(f"\\nProcessing folder: {folder}")
    folder_path = os.path.join(base_dir, folder)
    os.makedirs(folder_path, exist_ok=True)
    
    for p in folder_papers:
        title = p['title'].replace(' ', '_').replace(':', '')
        filepath = os.path.join(folder_path, f"{title}.pdf")
        
        if os.path.exists(filepath):
            print(f"Already exists: {title}.pdf")
            continue
            
        print(f"Attempting to download: {title}")
        success = False
        
        # 1. Try ArXiv directly if arxiv ID exists
        if p['arxiv']:
            arxiv_url = f"https://arxiv.org/pdf/{p['arxiv']}.pdf"
            print(f"  Trying ArXiv: {arxiv_url}")
            success = download_pdf(arxiv_url, filepath)
            
        # 2. Try Unpaywall if not downloaded yet and has DOI
        if not success and p['doi']:
            oa_url = get_unpaywall_url(p['doi'])
            if oa_url:
                print(f"  Trying Unpaywall OA URL: {oa_url}")
                success = download_pdf(oa_url, filepath)
                
        # 3. Fallback: Check if semantic scholar or core.ac.uk could provide it (Skipped for simplicity, usually Unpaywall covers OA)
        
        if success:
            print(f"  Success: {title}.pdf")
        else:
            print(f"  Failed: {title} (Paywalled or unavailable)")
            failed_downloads.append(p['title'])

        time.sleep(1) # respectful delay

print("\\nFailed to download automatically:")
for f in failed_downloads:
    print(f"- {f}")
