#!/usr/bin/env python3
"""
Pull the Interval Read demo pairs from the Hugging Face copy of NIH ChestX-ray14.

  pip install requests
  python pull_demo_pairs.py            # the five pairs inside train rows 0 to 99
  python pull_demo_pairs.py --extra    # also try three PA-then-AP nodule pairs deeper in the split

How it works:
  - Rows 0 to 99: one call to the first-rows endpoint (confirmed working on Nov 21).
  - Deeper rows (--extra): the rows endpoint with an offset. Untested. If it fails, you still have the five.
  - Every image is checked against the expected image_id before it is saved.
  - File type comes from the bytes, not the URL. Hugging Face serves JPEG.
  - case.json records media_type so the app sends the right type to the API.

Row numbers were computed from the NIH metadata table and the official test list, and they match
the eight rows Claude Code confirmed live (8, 9, 16, 17, 68, 69, 77, 78).
"""
import argparse, json, os, sys, time

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

BASE = "https://datasets-server.huggingface.co"
DS = {"dataset": "timm/nih-chest-xray-14", "config": "default", "split": "train"}

# use, prior row, prior image_id, current row, current image_id, note
FIRST_100 = [
    ("new_nodule",      16, "00000008_001", 17, "00000008_002", "Both PA. No Finding then Nodule."),
    ("control",          8, "00000005_003",  9, "00000005_004", "Both PA. No Finding on both. Any called change is a false flag."),
    ("new_effusion",    77, "00000039_003", 78, "00000039_004", "Both PA. Effusion added."),
    ("refusal_nodule",  33, "00000017_000", 34, "00000017_001", "PA then AP. Nodule and effusion labelled on the PA prior, nothing on the AP. Model should decline to call them resolved."),
    ("refusal_heart",   68, "00000038_002", 69, "00000038_003", "PA then AP. Cardiomegaly labelled on the AP only. Model should decline to call the heart enlarged."),
]
EXTRA = [
    ("refusal_nodule_both_a", 5176, "00001722_000", 5177, "00001722_001", "PA then AP. Nodule labelled on both. Model should decline to call size change."),
    ("refusal_nodule_both_b", 6150, "00001995_006", 6151, "00001995_007", "PA then AP. Nodule labelled on both."),
    ("refusal_mass_both",      674, "00000248_017",  675, "00000248_019", "PA then AP. Mass labelled on both."),
]


def get_json(path, params, tries=4):
    last = None
    for k in range(tries):
        try:
            r = requests.get(BASE + path, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            last = "{} {}".format(r.status_code, r.text[:120])
        except Exception as e:
            last = str(e)
        time.sleep(2 + 3 * k)
    print("   failed {}: {}".format(path, last))
    return None


def sniff(data):
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg", "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png", "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None, None


def download(row, expected_id):
    r = row["row"]
    if r.get("image_id") != expected_id:
        print("   row {} holds {} not {}. Skipped.".format(row.get("row_idx"), r.get("image_id"), expected_id))
        return None
    img = requests.get(r["image"]["src"], timeout=120)
    if img.status_code != 200:
        print("   image fetch {} for {}".format(img.status_code, expected_id))
        return None
    mt, ext = sniff(img.content)
    if not mt:
        print("   unknown file type for {}".format(expected_id))
        return None
    meta = {k: r.get(k) for k in ("image_id", "label_names", "patient_id", "follow_up", "patient_age",
                                  "patient_sex", "view_position", "original_width", "original_height")}
    return img.content, mt, ext, meta


def save_case(out, use, note, prior, current):
    d = os.path.join(out, use)
    os.makedirs(d, exist_ok=True)
    (pb, pmt, pext, pmeta), (cb, cmt, cext, cmeta) = prior, current
    open(os.path.join(d, "prior." + pext), "wb").write(pb)
    open(os.path.join(d, "current." + cext), "wb").write(cb)
    case = {
        "case_id": use,
        "source": "NIH ChestX-ray14 (NIH Clinical Center), via Hugging Face timm/nih-chest-xray-14. De-identified public data.",
        "why_picked": note,
        "prior": {"file": "prior." + pext, "media_type": pmt, "nih": pmeta},
        "current": {"file": "current." + cext, "media_type": cmt, "nih": cmeta},
        "_label_note": "NIH labels were text-mined from reports and are noisy. Hints only. Clinicians set ground truth by eye.",
        "synthetic_chart": {
            "_note": "SYNTHETIC. Written by the team. Not from the patient record.",
            "mrn": "", "display_name": "", "prior_date": "", "current_date": "",
            "indication": "", "ordering_provider": {"name": "", "role": "medical oncology | PCP | ED"},
            "prior_report": "", "vitals": {"hr": None, "spo2": None, "temp_c": None, "bp": ""},
            "labs": [], "problem_list": [],
            "pcp_on_file": True, "insurance_on_file": True, "preferred_language": "en",
        },
        "ground_truth": {
            "_note": "Fill BEFORE the first model run. One clinician labels, a second checks.",
            "labeled_by": "", "checked_by": "", "comparable": "yes | limited | no",
            "findings": [{"region": "", "status": "new | increased | decreased | stable | resolved | indeterminate"}],
            "should_refuse": [], "would_sign_ai_draft_with_minor_edits": None,
        },
    }
    json.dump(case, open(os.path.join(d, "case.json"), "w"), indent=2)
    print("   saved {} ({} + {})".format(d, pmt, cmt))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--extra", action="store_true")
    ap.add_argument("--out", default="cases")
    a = ap.parse_args()
    ok, bad = [], []

    print("first-rows (train rows 0 to 99)")
    fr = get_json("/first-rows", DS)
    rows = {r["row_idx"]: r for r in fr["rows"]} if fr else {}
    if not rows:  # fall back to the rows endpoint for the same range
        rr = get_json("/rows", dict(DS, offset=0, length=100))
        rows = {r["row_idx"]: r for r in rr["rows"]} if rr else {}
    for use, pr, pid, cr, cid, note in FIRST_100:
        print(use)
        p = download(rows[pr], pid) if pr in rows else None
        c = download(rows[cr], cid) if cr in rows else None
        if p and c:
            save_case(a.out, use, note, p, c); ok.append(use)
        else:
            bad.append(use)

    if a.extra:
        print("rows endpoint (deeper rows, untested)")
        for use, pr, pid, cr, cid, note in EXTRA:
            print(use)
            rr = get_json("/rows", dict(DS, offset=pr, length=2), tries=2)
            got = {r["row_idx"]: r for r in rr["rows"]} if rr else {}
            p = download(got[pr], pid) if pr in got else None
            c = download(got[cr], cid) if cr in got else None
            if p and c:
                save_case(a.out, use, note, p, c); ok.append(use)
            else:
                bad.append(use)

    print("\nsaved:", ok)
    if bad:
        print("not saved:", bad)


if __name__ == "__main__":
    main()
