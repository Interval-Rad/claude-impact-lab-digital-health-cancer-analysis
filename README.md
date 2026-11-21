# Interval Read

Claude Impact Lab NYC, Track 3 (Radiology / Oncology). Demo build. Not
for clinical use.

**Who it is for:** the radiologist reading a cancer patient's follow-up
chest film.

**The problem:** they write the comparison with the prior study from
scratch, and some image pairs cannot support a call.

**What it does:** compares the prior and current image and drafts a
structured first read: what changed, what did not, what to look at first,
and what it declines to call. A resident reviews it and an attending
signs it. Only then does the result go to the ordering provider.

## Safety design

- The reason for the scan is hidden from the blind reads.
- The blind read runs twice. The app shows agreement between the reads,
  not a model-reported confidence.
- The model gives no measurements. A radiologist enters them and code
  does the RECIST arithmetic.
- "Can't determine" is a first-class output with a reason and a next step.
- Nothing leaves radiology before the attending signs.

## Data

Public de-identified images from NIH ChestX-ray14. All chart data is
synthetic and labelled synthetic. Testing so far is a smoke test on a
small number of pairs, not a validation study.

Chest X-ray images: NIH Clinical Center, ChestX-ray14.
https://nihcc.app.box.com/v/ChestXray-NIHCC. Wang X, Peng Y, Lu L, Lu Z,
Bagheri M, Summers RM. ChestX-ray8: Hospital-scale Chest X-ray Database
and Benchmarks on Weakly-Supervised Classification and Localization of
Common Thorax Diseases. IEEE CVPR 2017, pp. 3462-3471.

## Layout

- agents/: reading method and the four agent specs
- dataset/: dataset guide, pair manifest, pull script
- BUILD_PROMPT.md: build instructions
