# Transcription benchmark report

Started: 2026-08-29T03:40:38.617Z  
Providers: mock, mock-noisy, mock-drifty, mock-flaky  
Repeats: 1  
Live evidence: **no**

> **No provider winner is claimed.** Only mock providers ran, so this report only demonstrates that the harness, fixtures, and scorer behave as designed. Run with live credentials to produce evidence.

- Only mock providers ran. These numbers validate the harness and scorer; they are NOT evidence about any real provider.
- Baseline provider "whisper" did not run; "better than baseline" gates are unevaluated.

## Provider summary

| Provider | Cases | Failure rate | Mean WER | Median WER | Entity acc. | Mean |drift| ms | Max drift slope ms/min | Break F1 | RTF | Cost (USD) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mock | 13 | 0.0% | 0.0% | 0.0% | 100.0% | 0 | 0 | 1.000 | 0.025 | unknown |
| mock-drifty | 13 | 0.0% | 2.3% | 1.8% | 100.0% | 132.2 | 764.43 | 0.843 | 0.042 | unknown |
| mock-noisy | 13 | 0.0% | 10.2% | 11.9% | 86.4% | 16.7 | 123.04 | 0.766 | 0.067 | unknown |
| mock-flaky | 13 | 46.2% | 48.2% | 10.3% | 100.0% | 4.9 | 12.07 | 0.904 | 0.05 | unknown |

## Acceptance gates

Baseline for accuracy comparison: `whisper`.

| Provider | Live evidence | No cumulative drift | Drift within tolerance | Failure rate ok | Better than baseline | Entity accuracy ok | Passes | Notes |
|---|---|---|---|---|---|---|---|---|
| mock | NO | yes | yes | yes | n/a | yes | no | mock provider: no live evidence; baseline "whisper" did not run |
| mock-drifty | NO | NO | NO | yes | n/a | yes | no | mock provider: no live evidence; baseline "whisper" did not run; cumulative timestamp drift; mean timestamp offset too large |
| mock-noisy | NO | NO | yes | yes | n/a | NO | no | mock provider: no live evidence; baseline "whisper" did not run; cumulative timestamp drift; entity accuracy below threshold |
| mock-flaky | NO | yes | yes | NO | n/a | yes | no | mock provider: no live evidence; baseline "whisper" did not run; failure rate too high |

## Mean WER by category

| Provider | clean | music | accent | code_switching | poor_mic | multilingual |
|---|---:|---:|---:|---:|---:|---:|
| mock | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| mock-drifty | 1.5% | 2.4% | 0.0% | 2.3% | 2.6% | 4.2% |
| mock-noisy | 12.2% | 11.9% | 4.5% | 9.3% | 9.0% | 9.1% |
| mock-flaky | 42.3% | 100.0% | 2.3% | 100.0% | 5.1% | 67.7% |

## Per-case results

| Case | Category | Provider | OK | WER | Entity | |drift| ms | Slope ms/min | Break F1 | Latency ms |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| clean-en-product-demo | clean | mock | yes | 0.0% | 100.0% | 0 | 0 | 1.000 | 543 |
| clean-en-product-demo | clean | mock-noisy | yes | 7.1% | 100.0% | 16.4 | -5.88 | 0.778 | 1449 |
| clean-en-product-demo | clean | mock-drifty | yes | 1.8% | 100.0% | 127.9 | 712.37 | 0.842 | 906 |
| clean-en-product-demo | clean | mock-flaky | yes | 5.4% | 100.0% | 5.3 | 8.35 | 0.941 | 1087 |
| clean-en-tutorial | clean | mock | yes | 0.0% | 100.0% | 0 | 0 | 1.000 | 396 |
| clean-en-tutorial | clean | mock-noisy | yes | 11.9% | 100.0% | 17.7 | -62.85 | 0.875 | 1057 |
| clean-en-tutorial | clean | mock-drifty | yes | 0.0% | 100.0% | 91 | 740.61 | 1.000 | 660 |
| clean-en-tutorial | clean | mock-flaky | yes | 0.0% | 100.0% | 5.9 | -4.76 | 1.000 | 793 |
| fast-en-hype | clean | mock | yes | 0.0% | 100.0% | 0 | 0 | 1.000 | 197 |
| fast-en-hype | clean | mock-noisy | yes | 11.5% | 100.0% | 15.4 | 90.02 | 1.000 | 525 |
| fast-en-hype | clean | mock-drifty | yes | 3.9% | 100.0% | 45 | 764.43 | 0.500 | 328 |
| fast-en-hype | clean | mock-flaky | no (UNAVAILABLE) | 100.0% | n/a | 0 | 0 | 0.000 | 0 |
| music-en-vlog | music | mock | yes | 0.0% | 100.0% | 0 | 0 | 1.000 | 395 |
| music-en-vlog | music | mock-noisy | yes | 11.9% | 100.0% | 17.9 | 34.23 | 0.714 | 1052 |
| music-en-vlog | music | mock-drifty | yes | 2.4% | 100.0% | 89.4 | 731.72 | 0.857 | 658 |
| music-en-vlog | music | mock-flaky | no (UNAVAILABLE) | 100.0% | n/a | 0 | 0 | 0.000 | 0 |
| accent-en-interview | accent | mock | yes | 0.0% | 100.0% | 0 | 0 | 1.000 | 525 |
| accent-en-interview | accent | mock-noisy | yes | 4.5% | 100.0% | 20.4 | -5.51 | 0.778 | 1400 |
| accent-en-interview | accent | mock-drifty | yes | 0.0% | 100.0% | 118.6 | 732.31 | 0.941 | 875 |
| accent-en-interview | accent | mock-flaky | yes | 2.3% | 100.0% | 4.5 | -11.14 | 0.824 | 1050 |
| code-switching-es-en | code_switching | mock | yes | 0.0% | n/a | 0 | 0 | 1.000 | 386 |
| code-switching-es-en | code_switching | mock-noisy | yes | 9.3% | n/a | 16.4 | 45.32 | 0.800 | 1029 |
| code-switching-es-en | code_switching | mock-drifty | yes | 2.3% | n/a | 83.6 | 733.21 | 0.857 | 643 |
| code-switching-es-en | code_switching | mock-flaky | no (UNAVAILABLE) | 100.0% | n/a | 0 | 0 | 0.000 | 0 |
| poor-mic-en-podcast | poor_mic | mock | yes | 0.0% | n/a | 0 | 0 | 1.000 | 444 |
| poor-mic-en-podcast | poor_mic | mock-noisy | yes | 5.1% | n/a | 17.8 | 23.94 | 0.800 | 1183 |
| poor-mic-en-podcast | poor_mic | mock-drifty | yes | 5.1% | n/a | 93.1 | 746.23 | 0.941 | 739 |
| poor-mic-en-podcast | poor_mic | mock-flaky | yes | 10.3% | n/a | 5.3 | -12.07 | 1.000 | 887 |
| hum-en-kitchen | poor_mic | mock | yes | 0.0% | 100.0% | 0 | 0 | 1.000 | 331 |
| hum-en-kitchen | poor_mic | mock-noisy | yes | 12.9% | 0.0% | 18.3 | 123.04 | 0.923 | 882 |
| hum-en-kitchen | poor_mic | mock-drifty | yes | 0.0% | 100.0% | 69.8 | 726.25 | 1.000 | 552 |
| hum-en-kitchen | poor_mic | mock-flaky | yes | 0.0% | 100.0% | 4.5 | -7.15 | 1.000 | 662 |
| multilingual-pt | multilingual | mock | yes | 0.0% | 100.0% | 0 | 0 | 1.000 | 406 |
| multilingual-pt | multilingual | mock-noisy | yes | 11.9% | 100.0% | 16.2 | -18.71 | 0.714 | 1083 |
| multilingual-pt | multilingual | mock-drifty | yes | 7.1% | 100.0% | 89.1 | 716.27 | 0.750 | 677 |
| multilingual-pt | multilingual | mock-flaky | no (UNAVAILABLE) | 100.0% | n/a | 0 | 0 | 0.000 | 0 |
| multilingual-de | multilingual | mock | yes | 0.0% | 100.0% | 0 | 0 | 1.000 | 378 |
| multilingual-de | multilingual | mock-noisy | yes | 12.5% | 100.0% | 13 | 50.43 | 0.667 | 1008 |
| multilingual-de | multilingual | mock-drifty | yes | 0.0% | 100.0% | 87.3 | 722.41 | 1.000 | 630 |
| multilingual-de | multilingual | mock-flaky | yes | 3.1% | 100.0% | 3.9 | -4.44 | 0.875 | 756 |
| multilingual-fr | multilingual | mock | yes | 0.0% | n/a | 0 | 0 | 1.000 | 410 |
| multilingual-fr | multilingual | mock-noisy | yes | 2.8% | n/a | 14.4 | 30.74 | 0.857 | 1094 |
| multilingual-fr | multilingual | mock-drifty | yes | 5.6% | n/a | 85.6 | 753.97 | 0.667 | 683 |
| multilingual-fr | multilingual | mock-flaky | no (UNAVAILABLE) | 100.0% | n/a | 0 | 0 | 0.000 | 0 |
| entities-en-brands | clean | mock | yes | 0.0% | 100.0% | 0 | 0 | 1.000 | 417 |
| entities-en-brands | clean | mock-noisy | yes | 18.4% | 77.8% | 16 | 20.76 | 0.533 | 1112 |
| entities-en-brands | clean | mock-drifty | yes | 0.0% | 100.0% | 96.9 | 664.48 | 0.824 | 695 |
| entities-en-brands | clean | mock-flaky | no (UNAVAILABLE) | 100.0% | n/a | 0 | 0 | 0.000 | 0 |
| long-en-monologue | clean | mock | yes | 0.0% | n/a | 0 | 0 | 1.000 | 2642 |
| long-en-monologue | clean | mock-noisy | yes | 12.2% | n/a | 17.2 | 1.38 | 0.515 | 7045 |
| long-en-monologue | clean | mock-drifty | yes | 1.8% | n/a | 640.7 | 720.67 | 0.778 | 4403 |
| long-en-monologue | clean | mock-flaky | yes | 5.9% | n/a | 5 | 1.13 | 0.685 | 5284 |
