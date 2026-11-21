#!/usr/bin/env python3
"""
Pull prior/current chest X-ray pairs for Interval Read from NIH ChestX-ray14.

Usage:
  pip install requests
  python pull_pairs.py nih_pairs_manifest.csv --per-category 2
  python pull_pairs.py nih_pairs_manifest.csv --category D_refusal_PA_then_AP --per-category 3
  python pull_pairs.py nih_pairs_manifest.csv --from-dir /path/to/extracted/images   # after untarring images_001.tar.gz

It tries three sources per image, in order:
  1. A local folder of extracted NIH PNGs (--from-dir)
  2. The Hugging Face dataset viewer API for timm/nih-chest-xray-14 (1024 px copies)
  3. Google's public bucket copy of the NIH PNGs

Output:
  cases/<case_id>/prior.png
  cases/<case_id>/current.png
  cases/<case_id>/case.json     <- metadata + blank synthetic chart + blank ground truth

NOTE: written without network access to these hosts. Run it on one pair first.
If a route fails, the script prints which one and moves on. Manual fallback:
open the Hugging Face viewer, search the image_id, save the image.
"""
import argparse, csv, json, os, shutil, sys, urllib.parse

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

HF_API = "https://datasets-server.huggingface.co/filter"
HF_DATASET = "timm/nih-chest-xray-14"
GCS = "https://storage.googleapis.com/gcs-public-data--healthcare-nih-chest-xray/png/{}"


def from_dir(image, folder):
    for root, _, files in os.walk(folder):
        if image in files:
            return open(os.path.join(root, image), "rb").read()
    return None


def from_hf(image_id):
    for split in ("train", "test"):
        params = {"dataset": HF_DATASET, "config": "default", "split": split,
                  "where": "\"image_id\"='{}'".format(image_id), "offset": 0, "length": 1}
        r = requests.get(HF_API + "?" + urllib.parse.urlencode(params), timeout=60)
        if r.status_code != 200:
            continue
        rows = r.json().get("rows", [])
        if rows:
            src = rows[0]["row"]["image"]["src"]
            img = requests.get(src, timeout=120)
            if img.status_code == 200:
                return img.content
    return None


def from_gcs(image):
    r = requests.get(GCS.format(image), timeout=120)
    return r.content if r.status_code == 200 else None


def fetch(image, local):
    routes = []
    if local:
        routes.append(("local folder", lambda: from_dir(image, local)))
    routes.append(("hugging face", lambda: from_hf(image.replace(".png", ""))))
    routes.append(("google bucket", lambda: from_gcs(image)))
    for name, fn in routes:
        try:
            data = fn()
        except Exception as e:  # keep going, report at the end
            print("   {} failed for {}: {}".format(name, image, e))
            data = None
        if data:
            print("   {} <- {}".format(image, name))
            return data
    return None


def case_json(row):
    return {
        "case_id": row["case_id"],
        "source": "NIH ChestX-ray14 (NIH Clinical Center). De-identified public data.",
        "category_hint": row["category"],
        "nih": {
            "patient_id": row["patient_id"], "sex": row["sex"],
            "prior": {"image": row["prior_image"], "view": row["prior_view"], "age": row["prior_age"],
                      "nlp_labels": row["prior_labels"], "px_mm_at_1024": row["prior_px_mm_at_1024"]},
            "current": {"image": row["current_image"], "view": row["current_view"], "age": row["current_age"],
                        "nlp_labels": row["current_labels"], "px_mm_at_1024": row["current_px_mm_at_1024"]},
        },
        "_note": "NIH labels were text-mined from reports and are noisy. They are hints, not ground truth.",
        "synthetic_chart": {
            "_note": "SYNTHETIC. Written by the team. Not from the patient record.",
            "mrn": "", "display_name": "",
            "prior_date": "", "current_date": "",
            "indication": "",
            "ordering_provider": {"name": "", "role": "medical oncology | PCP | ED"},
            "prior_report": "",
            "vitals": {"hr": None, "spo2": None, "temp_c": None, "bp": ""},
            "labs": [],
            "problem_list": [],
            "pcp_on_file": True, "insurance_on_file": True, "preferred_language": "en",
        },
        "ground_truth": {
            "_note": "Fill BEFORE running the model. One clinician labels, a second checks.",
            "labeled_by": "", "checked_by": "",
            "comparable": "yes | limited | no",
            "findings": [{"region": "", "status": "new | increased | decreased | stable | resolved | indeterminate"}],
            "should_refuse": [],
            "would_sign_ai_draft_with_minor_edits": None,
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--per-category", type=int, default=2)
    ap.add_argument("--category", default=None)
    ap.add_argument("--from-dir", default=None)
    ap.add_argument("--out", default="cases")
    a = ap.parse_args()

    rows = list(csv.DictReader(open(a.manifest)))
    taken, failed = {}, []
    for row in rows:
        cat = row["category"]
        if a.category and cat != a.category:
            continue
        if taken.get(cat, 0) >= a.per_category:
            continue
        row["case_id"] = "{}_{}".format(cat.split("_")[0], row["prior_image"].replace(".png", ""))
        print(row["case_id"], "|", row["prior_labels"], "->", row["current_labels"])
        prior = fetch(row["prior_image"], a.from_dir)
        current = fetch(row["current_image"], a.from_dir)
        if not (prior and current):
            failed.append(row["case_id"])
            continue
        d = os.path.join(a.out, row["case_id"])
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "prior.png"), "wb").write(prior)
        open(os.path.join(d, "current.png"), "wb").write(current)
        json.dump(case_json(row), open(os.path.join(d, "case.json"), "w"), indent=2)
        taken[cat] = taken.get(cat, 0) + 1

    print("\nDone:", taken)
    if failed:
        print("Could not fetch:", failed)
        print("Manual route: search each image_id in the Hugging Face viewer and save the image.")


if __name__ == "__main__":
    main()
