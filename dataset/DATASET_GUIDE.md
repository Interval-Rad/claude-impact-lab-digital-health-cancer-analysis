# Interval Read: dataset guide

Owner: Nadia. Goal: 5 to 8 prior/current pairs, labelled by clinicians before the model runs.

One correction to the plan's wording: this data does not train the model. It does three jobs: test cases for the scorecard, demo cases, and a few worked examples placed in the prompt.

## Verdict by source

| Source | What you get | Pairs? | Usable before 2:30? | License and terms |
|---|---|---|---|---|
| NIH ChestX-ray14 | 112,120 frontal chest X-rays, 30,805 patients | Yes. 13,302 patients have 2 or more studies. `Follow-up #` orders them | Yes. Primary source | No restrictions on use. Attribution required (below) |
| NIH DeepLesion | CT key slices with radiologist RECIST diameters. 32,735 lesions, 10,594 studies, 4,427 patients | Yes. `Patient_index` + `Study_index` | Stretch. Use for the RECIST math demo | NIH public release. The Hugging Face mirror is tagged CC BY-SA 4.0 |
| TCIA Anti-PD-1_Lung | 46 lung patients on immunotherapy, pre-treatment CT and most with one follow-up. 86 studies | Yes | No. 61.24 GB of DICOM, needs NBIA Data Retriever | CC BY 3.0 |
| TCIA RIDER Lung CT | 32 NSCLC patients, same-day repeat CTs | Yes, as a "nothing changed" control | No. Full DICOM volumes | Images CC BY 4.0. Lesion notes CC BY 3.0 |
| TCIA NSCLC-Radiomics | 422 NSCLC patients, pre-treatment CT only | No | Skip | CC BY-NC 3.0 |
| Radiopaedia | Curated teaching cases with expert descriptions | Some cases show follow-up | Reference only | Modified CC BY-NC-SA 3.0. Their terms say the site is not meant as an AI or machine learning dataset and bar bulk or automated download |
| MIMIC-CXR, MS-CXR-T, CheXpert | Chest X-rays with reports. MS-CXR-T has temporal labels | Yes | No. Credentialed access takes days | Data use agreements |

Radiopaedia: use it to check your own reading of a finding. If you show a case in the demo, hand-pick one, credit it the way the case page asks, keep it non-commercial, and keep it out of the repo. Do not scrape. This is a practical reading of their terms, not legal advice.

## Primary source: NIH ChestX-ray14

Where to get it:
- NIH Box: https://nihcc.app.box.com/v/ChestXray-NIHCC (12 image batches, about 2 GB each, plus `Data_Entry_2017.csv`)
- Hugging Face mirror: `timm/nih-chest-xray-14` (1024 px images. Columns: `image_id`, `patient_id`, `follow_up`, `view_position`, `label_names`, `patient_age`, `patient_sex`, `original_width`, `pixel_spacing_x`. Train 86.5k rows, test 25.6k rows)
- Google Cloud public bucket: `gs://gcs-public-data--healthcare-nih-chest-xray/png/FILENAME.png`

What it lacks, and what to do about it:

| Gap | Effect | Fix |
|---|---|---|
| No reports | No prior report text | Write a short synthetic prior report per case. Label it synthetic |
| No study dates | Interval between studies unknown | Assign synthetic dates. Label them synthetic |
| Labels text-mined from reports | Labels are wrong often enough to matter | Treat labels as hints for picking cases. Clinicians set ground truth by looking |
| No lateral views | Retrocardiac and apical calls are limited | Expect the model to say so. Score it as correct |
| 1024 px downsample | Small nodules blur | Favor cases with a mass or a clear nodule |
| Unknown magnification, square 1024 px copies | Millimeter sizes from pixels are unreliable | The radiologist types measurements in. Code does RECIST |

Attribution the NIH asks for. Put this on the last slide and in the app's About panel:

> Chest X-ray images: NIH Clinical Center, ChestX-ray14. https://nihcc.app.box.com/v/ChestXray-NIHCC. Wang X, Peng Y, Lu L, Lu Z, Bagheri M, Summers RM. ChestX-ray8: Hospital-scale Chest X-ray Database and Benchmarks on Weakly-Supervised Classification and Localization of Common Thorax Diseases. IEEE CVPR 2017, pp. 3462-3471.

## The pair manifest: `nih_pairs_manifest.csv`

Built from the NIH metadata table for all 112,120 images. Each row is one patient's two consecutive studies. Filters: age 40 to 90, consecutive follow-up numbers, age gap of 2 years or less. 48 pairs, 8 per category.

| Category | Rule | Pairs in the full dataset | Use in the test set |
|---|---|---|---|
| A_new_nodule_or_mass | Prior "No Finding", current Nodule or Mass, both PA | 827 | New lesion |
| B_persistent_nodule_or_mass | Nodule or Mass on both, both PA | 1,161 | Stable, progression or response. Clinician decides which |
| C_resolved | Nodule or Mass on prior, "No Finding" on current, both PA | 741 | Response, or a label error. Check by eye |
| D_refusal_PA_then_AP | Nodule or Mass on both, prior PA, current AP | 449 | The required refusal case |
| E_control_no_finding | "No Finding" on both, both PA | 6,693 | False-flag check. Any called change is a miss |
| F_new_effusion_with_known_mass | Mass or Nodule on both, Effusion added on current | 123 | Progression with a second finding |

Columns to know:
- `prior_image`, `current_image`: NIH file names. `prior_image_id`, `current_image_id`: the same without `.png`.
- `prior_view`, `current_view`: PA or AP.
- `prior_hf_train_row`, `current_hf_train_row`: row number in the Hugging Face train split. Blank means the image sits in the test split. Computed from the NIH metadata and the official test list. Checked against eight rows Claude Code confirmed live.
- `nih_batch_hint`: `images_001.tar.gz` for patient ids up to 1335. From memory of the NIH batch layout.

No pixel spacing columns. The public copies are stored square at 1024 px from non-square originals such as 2048 by 2500, so one spacing value is about 22 percent off on one axis. Skip the caliper. The radiologist types measurements in.

## Pulling the images

What failed on Nov 21: the Google bucket returned "Access denied". The Hugging Face filter endpoint returned "index loading". The one filter call which answered found no row for `00000618_006` in train, because this image sits in the test split.

What works: the Hugging Face first-rows call, which returns image links for train rows 0 to 99. Five usable pairs are inside it.

| Use | Prior, current | Rows | Live metadata |
|---|---|---|---|
| New nodule | 00000008_001, 00000008_002 | 16, 17 | Both PA. No Finding then Nodule |
| Control | 00000005_003, 00000005_004 | 8, 9 | Both PA. No Finding on both |
| New effusion | 00000039_003, 00000039_004 | 77, 78 | Both PA. Effusion added |
| Refusal, nodule | 00000017_000, 00000017_001 | 33, 34 | PA then AP. Effusion, Infiltration, Nodule on the PA. No Finding on the AP |
| Refusal, heart size | 00000038_002, 00000038_003 | 68, 69 | PA then AP. Cardiomegaly on the AP only |

Rows 33 and 34 give an oncology-relevant refusal: a nodule on the PA prior and nothing labelled on the AP current. The model should decline to call it resolved. I have not seen these images. A clinician looks before it becomes the demo case.

```
pip install requests
python pull_demo_pairs.py            # the five pairs above
python pull_demo_pairs.py --extra    # also tries three PA-then-AP pairs with a nodule or mass on both
```

The script checks each row's `image_id` before saving, reads the file type from the bytes (Hugging Face serves JPEG), saves `prior.jpg` and `current.jpg`, and records `media_type` in `case.json`. The `--extra` rows (5176, 6150, 674) use the rows endpoint with an offset. I have not been able to test it. If it fails you still have five pairs.

## What Nadia fills in per case (`case.json`)

`synthetic_chart` (label every field synthetic in the UI):
- `indication`: for example "Known lung adenocarcinoma, restaging after 3 cycles"
- `ordering_provider`: name and role
- `prior_report`: three to five lines
- `prior_date`, `current_date`
- `vitals`, `labs`, `problem_list`: short
- `pcp_on_file`, `insurance_on_file`, `preferred_language`: set one case to no PCP, no insurance, ED order. This is the population health case

`ground_truth` (fill before the model runs, second clinician checks):
- `comparable`: yes, limited or no
- `findings`: region and status for each
- `should_refuse`: questions the model should decline
- After the run: `would_sign_ai_draft_with_minor_edits`: yes or no

## Scorecard

One row per case:

| Case | Findings in ground truth | Caught | False flags | Correct refusals | Calls which should have been refusals | Reads agreed (of findings) | Would sign with minor edits |
|---|---|---|---|---|---|---|---|

Say the totals out loud in the demo, with the real number of cases labelled and run. A handful of cases is a smoke test, not a validation study. Say this too. Judges trust a team more when it names the limit.

## Stretch: DeepLesion for the RECIST demo

- `DL_info.csv` lists each lesion's key slice, its diameters in pixels and the pixel spacing in mm. Multiply to get millimeters. Check the column names in the file header.
- Group rows by `Patient_index`. Two `Study_index` values for one patient with the same lesion type give a prior/current pair with real radiologist measurements.
- Hugging Face mirror `farrell236/DeepLesion` has 8-bit windowed PNG slices on the `Images_png_wn` branch and annotated key slices on the `Key_slices` branch.
- Use: the radiologist-confirmed measurements go into the review screen, and code computes RECIST from them. This shows the arithmetic path with real numbers.
- Limit: one slice per lesion. The model must say the rest of the chest is unseen.

## After the hackathon

- TCIA Anti-PD-1_Lung for real pre-treatment and follow-up CT volumes.
- RIDER Lung CT as a repeatability control: same-day repeat scans, so any called change is an error.
- MIMIC-CXR with MS-CXR-T for temporal labels with reports, once someone holds PhysioNet credentials.
- TCIA 4D-Lung: 20 patients, 14 with weekly CT during chemoradiotherapy, 183.04 GB, CC BY 3.0. No TCIA collection publishes an exact count of patients with two acquisition dates, so audit the metadata before quoting one.

## Prompt for Perplexity, if you want more

```
I need public, de-identified chest imaging datasets with at least two timepoints
per patient, usable today with no credentialing or data use application.
For each dataset give: modality, number of patients with 2+ studies, whether
radiology reports or lesion measurements are included, file format, total
size, license, the exact download URL, and whether single images are fetchable
without downloading the whole archive. Prioritize lung cancer follow-up and
treatment response. Exclude MIMIC-CXR, CheXpert and anything needing PhysioNet
credentialing. Cite the dataset's own page for every claim.
```
