# Meet Notebook

Meet Notebook is a local-first Google Meet recording and transcription extension built on Chrome Manifest V3. It combines meeting tab capture, optional microphone recording, speaker-labelled Google Meet captions, optional Chrome on-device dictation, searchable transcript history, local video playback, transcript exports and an optional AI meeting assistant.

The extension is designed to keep the recording and transcript workflow inside the user's browser profile. It does not operate a Meet Notebook cloud backend.

## Contents

- [What the extension does](#what-the-extension-does)
- [Install and first-time setup](#install-and-first-time-setup)
- [Services and architecture](#services-and-architecture)
- [Transcription services in detail](#transcription-services-in-detail)
  - [1. Google Meet caption capture](#1-google-meet-caption-capture-primary-transcription-source)
  - [2. Chrome on-device speech recognition](#2-chrome-on-device-speech-recognition-optional)
  - [3. Transcript stitching and cleanup](#3-transcript-stitching-and-cleanup)
  - [4. Speaker labels and timestamps](#4-speaker-labels-and-timestamps)
  - [5. Transcript storage and export](#5-transcript-storage-and-export)
  - [6. Accuracy, language and limitations](#6-accuracy-language-and-limitations)
- [Audio and video recording pipeline](#audio-and-video-recording-pipeline)
- [AI meeting assistant](#ai-meeting-assistant)
- [Privacy and data lifecycle](#privacy-and-data-lifecycle)
- [Troubleshooting](#troubleshooting)
- [Development and verification](#development-and-verification)

## What the extension does

- Opens a Chrome Side Panel for meeting controls and a live transcript.
- Starts, pauses, resumes and stops a recording of the active Google Meet tab.
- Captures speaker-attributed captions rendered by Google Meet.
- Optionally runs Chrome's local speech-recognition capability on the user's own microphone and labels those results separately as **You (on-device)**.
- Can hide the Meet caption overlay while continuing to read its caption content for the Side Panel; the original caption styling is restored when recording stops.
- Captures the meeting tab audio and optionally mixes in a selected microphone.
- Shows microphone and tab-audio level meters and provides microphone setup and device selection.
- Stores meeting records, transcript entries and a local playback copy of the video.
- Supports transcript search, manual notes, TXT/Markdown/JSON export and copy.
- Provides an optional AI meeting assistant with Gemini, Groq, Anthropic Claude and OpenAI API support.
- Offers a no-API-key handoff from the Ask AI page to a new ChatGPT or Claude chat.

## Install and first-time setup

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository folder containing `manifest.json`.
5. Open a Google Meet meeting and click the Meet Notebook extension icon. You can also use **Alt+Shift+N** to open the Side Panel.
6. Open **Settings → Test microphone / grant access**. Grant microphone permission and select the microphone you actually use.
7. Speak at a normal volume and check the microphone level meter.
8. In Google Meet, turn on captions and select the correct caption language. Meet Notebook attempts to enable captions when recording starts, but verify that captions are visible in Meet before relying on the transcript.
9. Optionally enable **Add on-device transcription of my voice** and install/check the Chrome speech model for your language.
10. Tell all participants before recording and comply with your organization's policies and applicable law.

**Minimum manifest version:** Chrome 116. Some optional capabilities—especially Chrome on-device speech recognition—require a newer Chrome build and a supported installed language pack. Availability depends on the browser build and platform.

## Services and architecture

Meet Notebook is composed of several cooperating extension components. These are browser-side services, not separately hosted Meet Notebook servers.

| Component / service | Responsibility |
|---|---|
| Chrome Side Panel (`sidepanel.html/js`) | User interface for recording controls, transcript, search, notes, settings, past meetings and playback |
| Meet content script (`content.js`) | Observes the Google Meet page, locates caption regions, reads speaker/text pairs, manages caption visibility and publishes transcript updates |
| Transcript helper (`lib/transcript.js`) | Shared text-merging, duplicate handling, speaker-turn formatting and export logic |
| Manifest V3 service worker (`background.js`) | Coordinates recording sessions, messages, pause/resume, transcript persistence, downloads and session lifecycle |
| Offscreen document (`offscreen.html/js`) | Performs media capture and recording work that needs a document context, including Web Audio, MediaRecorder and IndexedDB persistence |
| Microphone setup page (`setup.html/js`) | Requests microphone permission, lists input devices, stores the selected device and tests the input level |
| Chrome on-device speech recognition | Optional local dictation path for the user's own microphone; it is separate from Meet's caption service |
| Chrome storage APIs | Store settings, session metadata, transcript data and current recording state in the browser profile |
| IndexedDB | Stores recording chunks while recording and the finalized video blob for local playback |
| Chrome Downloads API | Saves the finalized video and transcript export files to the user's Downloads location |
| Optional AI provider APIs | Generate summaries and answer questions only after the user explicitly requests AI analysis |

### Main recording and transcription flow

```text
Google Meet tab
    |
    +--> Meet caption UI
    |       |
    |       v
    |   content.js + MutationObserver
    |       |
    |       v
    |   lib/transcript.js
    |       |
    |       v
    |   background.js --> chrome.storage.local
    |                         |
    |                         +--> Side Panel live transcript
    |                         +--> Past meetings / exports / Ask AI
    |
    +--> tabCapture --> offscreen document --> MediaRecorder
                           ^                      |
                           |                      v
                    optional mic             IndexedDB chunks
                    capture + Web Audio          |
                                                 v
                                      finalized local video
                                                 |
                                      IndexedDB + Downloads

Optional separate path:
Selected microphone --> local audio processing --> Chrome on-device
SpeechRecognition --> "You (on-device)" transcript entries
```

### Chrome extension permissions and why they are used

- `tabCapture`: obtains the active Meet tab's audio/video stream after the user starts recording.
- `offscreen`: allows media capture, audio processing, MediaRecorder and blob work in an offscreen document.
- `storage`: persists settings, transcript entries and meeting/session metadata.
- `unlimitedStorage`: requests expanded extension-origin storage capacity for local meeting data; actual device storage is still finite.
- `downloads`: saves transcript and video files.
- `activeTab` and `scripting`: support interaction with the active Meet tab and recovery/injection of the content script when needed.
- `sidePanel`: opens the extension's Side Panel.
- `clipboardWrite`: supports explicit copy actions and the long-transcript ChatGPT/Claude handoff.

Host access is limited to Google Meet and the configured AI provider API hosts: Gemini, Groq, OpenAI and Anthropic.

## Transcription services in detail

Meet Notebook has **two distinct transcription paths**. Understanding the difference is important:

1. **Google Meet captions are the primary speaker-labelled transcript source.** Meet performs the speech recognition and renders captions. Meet Notebook reads those rendered captions from the Meet page.
2. **Chrome on-device speech recognition is optional.** It can independently transcribe the selected microphone—normally the local user's voice—and adds entries labelled **You (on-device)**.

These paths are not interchangeable. Meet Notebook does not send meeting audio to a third-party speech-to-text API, and the optional local dictation path is not a cloud transcription provider.

### 1. Google Meet caption capture (primary transcription source)

**What performs speech recognition?**

Google Meet's own captioning system. Meet Notebook does not run a separate cloud ASR model for this path. It reads the caption text and speaker labels that Google Meet has already rendered in the meeting page.

**How the capture works**

1. The content script is loaded on `https://meet.google.com/*`.
2. When a recording starts, the extension attempts to turn captions on if Meet exposes a matching **Turn on captions** control.
3. The content script searches for likely caption containers using accessible labels and live-region selectors.
4. A `MutationObserver` watches the caption region for new child nodes, changed text and rebuilt caption elements.
5. The script extracts the speaker label and caption text from the rendered caption blocks. It filters common caption controls and non-caption interface text.
6. If Meet rebuilds its caption area, a second observer watches the page structure and the extension periodically attempts to reattach to the current caption region.
7. New or revised caption text is merged into the current speaker entry and published to the service worker.
8. The Side Panel receives updates and renders the transcript while the meeting continues.

**Speaker attribution**

Speaker names come from the labels displayed by Google Meet. The extension does not identify a person by voice biometrics and does not infer identity from the audio. The caption speaker label is retained as the transcript speaker. The configured local user's name can be used to normalize the user's own speaker label in transcript formatting.

**Hiding the native caption overlay**

The setting **Hide Meet captions on the meeting screen** changes the caption region's visual opacity and pointer-event behavior. It does not stop the content script's observer or remove the caption content from the page. This allows the Side Panel to remain the primary transcript view. The original inline style values are saved and restored when the recording stops. If Meet replaces the caption region, the script attaches to the replacement region.

**Important dependency**

This source depends on Google Meet captions being enabled, rendered and accessible in the page DOM. If captions are disabled, the language is wrong, Meet changes its page markup, or the caption region cannot be found, the speaker-labelled transcript may be incomplete or unavailable. Reloading the Meet tab and enabling captions again can help when the caption observer cannot attach.

### 2. Chrome on-device speech recognition (optional)

This is a separate transcription service for the **selected microphone**, intended primarily to add a local transcript of the user's own speech.

**Technology**

The extension uses the browser's `SpeechRecognition` / `webkitSpeechRecognition` implementation and requests local processing with:

- `processLocally: true`
- `quality: 'dictation'`
- The selected language code

It checks model availability through the browser's `SpeechRecognition.available()` API. If the language pack is downloadable, the extension can request installation using `SpeechRecognition.install()`. The browser must support these APIs and provide a compatible local language pack.

**Supported language choices exposed in Settings**

- English (US) — `en-US`
- Hindi (India) — `hi-IN`
- English (UK) — `en-GB`
- Spanish — `es-ES`
- French — `fr-FR`

The presence of a language in this menu does not guarantee that every Chrome build has a downloadable local model for it. The browser's availability response is authoritative.

**Processing pipeline**

1. Enable **Add on-device transcription of my voice** in Settings.
2. Select the desired speech language and use **Install / check local speech model**.
3. At recording time, the extension checks that the local recognition APIs are available and that the requested language pack is installed.
4. It opens the selected microphone using `getUserMedia()`. If a device was selected in microphone setup, that device ID is requested.
5. A local Web Audio graph prepares the microphone signal:
   - High-pass filter at approximately 85 Hz to reduce low-frequency rumble.
   - Dynamics compression to reduce large differences in speech level.
   - Adjustable gain based on the microphone sensitivity setting.
   - Optional automatic gain adjustment based on the measured input level.
6. The processed audio track is supplied to the browser's local speech recognizer.
7. Recognized final results are stored as transcript entries labelled **You (on-device)** with elapsed meeting timestamps.
8. If the recognizer ends unexpectedly while recording is still active, the extension attempts to restart it.
9. On pause, the local recognizer is stopped; it is started again when recording resumes. On stop, its microphone stream and audio resources are released.

**What this path does not do**

- It does not provide speaker diarization for every meeting participant.
- It does not replace Google Meet's speaker-attributed captions.
- It does not guarantee transcription of remote participants; it listens to the selected local microphone.
- It does not use OpenAI Whisper, Google Cloud Speech-to-Text, AWS Transcribe or another hosted speech API.
- It cannot work if the browser lacks the local recognition API or the selected language pack.

**Why the transcript may show two entries for the same words**

Meet captions can already include the local user's speech. The optional local recognizer may produce a second version of the same words. Meet Notebook marks the sources separately and checks local-ASR entries against nearby Meet captions for the configured user. When sufficient text overlap is detected, the duplicate local-ASR entry is hidden from the displayed/exported transcript. If the two recognition paths disagree or the Meet caption does not cover the local speech, both sources may remain visible.

### 3. Transcript stitching and cleanup

Live captions are not always delivered as one final sentence. Meet can repeatedly revise a partial caption as it recognizes more words. A naïve append-only transcript would repeat those words. Meet Notebook therefore uses the shared `lib/transcript.js` helper.

Its responsibilities include:

- **Rolling-window overlap detection:** compares the beginning of a new caption window with the end of the existing speaker text.
- **Case and punctuation normalization:** compares normalized words so harmless punctuation or case changes do not create duplicate entries.
- **Partial-word correction:** recognizes likely revisions such as a short partial word becoming a longer completed word.
- **Overlap stitching:** preserves the existing prefix and appends only genuinely new words after the overlap.
- **Duplicate-window suppression:** ignores a caption window that is already contained in the existing text.
- **Repeated phrase cleanup:** collapses certain repeated word runs caused by re-rendered caption windows.
- **Speaker turn continuation:** if a speaker's caption reappears shortly after another speaker's caption, the helper checks whether it overlaps an earlier entry before creating a new turn.
- **Auxiliary-entry filtering:** can hide local-ASR text already covered by Meet captions for the user's own speaker label.

The content script waits briefly (about 650 ms) after a caption change before marking the active entry committed. The text is still published during the live update cycle, so the Side Panel can display partial text before it becomes stable.

This is a heuristic cleanup system, not a guarantee of perfect transcription. If the source caption is wrong, the extension may preserve that error. It cannot reconstruct speech that Meet or the local recognizer did not recognize.

### 4. Speaker labels and timestamps

- Meet caption entries use the speaker label extracted from the Meet caption UI.
- Local microphone-recognition entries use **You (on-device)**.
- Manual notes use **My note** and are stored as note entries, not represented as recognized speech.
- Transcript times are elapsed meeting seconds, not wall-clock timestamps for every individual word.
- The elapsed timer excludes paused intervals. Both the recording and caption capture are paused/resumed together through the extension controls.
- Participant names visible in Meet may also be collected periodically for the meeting roster. This roster is separate from speech recognition and is not used as voice identification.

### 5. Transcript storage and export

**During a meeting**

- The content script publishes caption updates to the service worker.
- The service worker stores transcript entries in `chrome.storage.local` under the meeting's transcript key and updates the saved session record.
- Optional local-ASR results and manual notes are stored alongside the Meet entries with a source marker.
- The Side Panel listens for storage changes and refreshes the visible transcript.

**After a meeting**

The transcript is associated with a saved meeting session and can be opened from **Past meetings**. The extension supports:

- TXT — readable speaker-labelled plain text.
- Markdown — speaker turns in Markdown format.
- JSON — structured meeting metadata and transcript turns.
- Copy — copies the visible transcript text.
- Search — filters transcript entries by speaker or text.
- Manual notes — adds timestamped notes to the current meeting.

Deleting a meeting removes its extension-managed session/transcript data and its local IndexedDB video/chunk records. It does not remove a video or transcript file that Chrome has already downloaded to the user's Downloads folder.

### 6. Accuracy, language and limitations

Transcription quality depends on the source service and meeting conditions.

For the best Meet-caption transcript:

- Turn on Google Meet captions.
- Select the language actually being spoken in Meet's caption settings.
- Use clear speech and a stable internet connection.
- Allow time for Meet to finish revising live partial captions.
- Avoid overlapping speech where possible.

For optional local dictation:

- Select the correct microphone in **Test microphone / grant access**.
- Choose the language that matches the user's speech.
- Install/check the local language model before recording.
- Keep the microphone close enough for a clear signal and avoid clipping.
- Use the input meter to avoid unnecessarily high gain; high gain can amplify background noise.

Known limitations:

- Meet's DOM and accessibility markup can change. A change to the caption UI may require an update to the content-script selectors.
- Captions can be delayed, incomplete, mistranscribed or unavailable for some languages and accounts.
- Overlapping speakers, background noise, accents, low microphone quality, fast speech and technical terms can reduce accuracy.
- Speaker labels depend on Google Meet's own caption attribution.
- Chrome on-device speech recognition is experimental/browser-dependent; model availability and behavior vary by Chrome version and operating system.
- Local dictation is a separate microphone capture path and can duplicate Meet's caption of the user's speech.
- Neither transcription path produces guaranteed word-level timestamps.

## Audio and video recording pipeline

### Sources

The recorder captures:

1. **Meet tab media:** the tab-capture stream supplies the meeting video and tab audio.
2. **Optional microphone:** a separately selected microphone can be mixed into the saved recording. If microphone access fails, the extension reports the issue; tab capture and Meet caption capture may still be usable.

### Audio processing

The offscreen document builds a Web Audio graph at a requested 48 kHz sample rate.

- Tab audio is routed through a gain stage into the mix.
- Microphone audio can pass through high-pass and low-pass filters, a compressor and an adjustable gain stage.
- The voice-enhancement option changes filter behavior and enables noise suppression in microphone capture constraints.
- Automatic gain adjusts microphone gain based on measured RMS input level.
- A final dynamics compressor/limiter reduces peaks before the mixed audio is sent to the recorder.
- Separate microphone and tab-audio meters are published to the Side Panel.

Microphone sensitivity and voice enhancement affect the recorded microphone track. The optional on-device dictation path builds its own local microphone-processing graph for recognition.

### Video quality and encoding

The available quality presets are:

| Preset | Target dimensions | Target video bitrate |
|---|---:|---:|
| Data saver | 1280 × 720 | 2 Mbps |
| Standard | 1280 × 720 | 4 Mbps |
| High | 1920 × 1080 | 8 Mbps |

The recorder requests a frame rate of up to 30 fps. Browser and tab-capture constraints are best-effort; the browser may not honor every requested dimension or frame rate.

The extension chooses a supported MediaRecorder format:

- MP4 with H.264/AAC when the browser reports support.
- Otherwise WebM with VP8/Opus, or the browser's supported WebM fallback.

These are requested/selected recording formats, not a guarantee that every Chrome platform supports MP4 recording.

### Chunking, finalization and playback

- MediaRecorder emits media chunks approximately every second.
- Each chunk is written to IndexedDB as it arrives, reducing reliance on keeping the entire recording in memory.
- When recording stops, pending chunk writes are awaited and chunks are reassembled in order.
- For WebM output, the finalization code repairs duration metadata and adds CuePoints to improve native player timeline and seeking behavior.
- The finalized video blob is stored in IndexedDB for playback inside Meet Notebook.
- The extension also saves a copy through Chrome Downloads.
- The Side Panel can open the locally stored video and use the browser's native video controls for playback and seeking.

Long recordings can consume substantial local storage. The `unlimitedStorage` permission does not create unlimited physical disk capacity. Keep sufficient free space and delete old meeting records when they are no longer needed.

## AI meeting assistant

The AI assistant is optional and is separate from the transcription pipeline. It analyzes an already saved transcript; it does not perform the live caption recognition.

### Supported providers

| Provider | API endpoint family | Model behavior |
|---|---|---|
| Google Gemini | Google Generative Language API | Defaults to `gemini-2.5-flash` when no model is entered |
| Groq | Groq OpenAI-compatible chat API | Can discover an active chat model from the account's model catalogue when the model field is blank |
| Anthropic Claude | Anthropic Messages API | Can discover an active Claude model when the model field is blank |
| OpenAI | OpenAI Chat Completions API | Defaults to `gpt-4o-mini` when no model is entered |

Provider model availability, pricing, rate limits and account requirements can change. A provider's API billing is separate from any consumer chat subscription.

### Setup

1. Open **Settings → AI meeting assistant**.
2. Select Gemini, Groq, Claude or OpenAI.
3. Follow the provider's API-key link and create a key.
4. Paste the key and optionally enter a model ID.
5. Save the key.
6. Open **Past meetings → Ask AI** for the meeting you want to analyze.

API keys are stored in `chrome.storage.local` in the current browser profile. This is browser-local storage, not encrypted secret storage. Use a key with appropriate permissions, do not share your browser profile, and revoke a key if it is exposed.

### AI features

- Generate a structured meeting summary.
- Ask questions about the selected meeting transcript.
- Copy AI answers.
- Render Markdown-formatted headings, lists, tables, code and links.
- Split long transcripts into sections, summarize the sections, then use those summaries as context for the final answer.
- Display provider-specific errors for authentication failures, rate limits, invalid models and temporary provider outages.

When a user requests a summary or answer, the transcript is sent to the selected provider API. The extension does not send transcript content to an AI provider merely because a key is configured.

### ChatGPT and Claude handoff

The dedicated Ask AI page also provides **Open in ChatGPT**, **Open in Claude** and **Copy full transcript prompt**.

- This handoff does not require configuring an API key in Meet Notebook.
- When the prompt fits the extension's conservative URL-size threshold, the transcript prompt is included in the new chat URL.
- For larger transcripts, the full prompt is copied to the clipboard and a new chat opens so the user can paste it.
- The user reviews and submits the prompt themselves.
- The transcript may be present in the provider URL and browser history when prefilled. Review sensitive meeting content before using this option.

## Privacy and data lifecycle

- Meeting video, transcript entries, notes, session metadata and settings are stored in the local Chrome profile using extension storage and IndexedDB.
- The extension does not upload meeting media or transcripts to a Meet Notebook-operated server.
- Google Meet captions are generated by Google Meet; Meet Notebook reads the rendered caption text from the Meet page.
- The optional local dictation path requests browser-side local processing with `processLocally: true`; it is not a call to a Meet Notebook transcription server.
- When the user explicitly requests AI analysis, the selected transcript is sent to the chosen AI provider.
- When the user chooses ChatGPT/Claude handoff, the transcript is passed in the URL or clipboard as described above.
- Downloaded copies in the operating system's Downloads folder are separate from the extension's local session data.
- Participants should be informed before recording. Follow applicable law, company policy and meeting-consent requirements.

## Troubleshooting

### No speaker-labelled transcript appears

1. Confirm Google Meet captions are enabled.
2. Confirm Meet is displaying the correct caption language.
3. Reload the Meet tab and start a new recording.
4. Check that the Meet caption region appears on screen before relying on capture.
5. If Meet has changed its caption UI, the content-script selectors may need to be updated.

### Meet captions are hidden, but transcript still appears

This is expected when **Hide Meet captions on the meeting screen** is enabled. The extension changes the caption region's visual styling while continuing to observe its content. The original style is restored when recording stops.

### Local speech model cannot be installed

1. Check that Chrome supports the on-device SpeechRecognition APIs.
2. Open **Settings → Install / check local speech model**.
3. Confirm that the selected language has a model available in this Chrome build.
4. If the model is unavailable, disable local transcription and continue using Meet captions.

Meet captions do not depend on the optional local dictation model.

### Microphone is missing or silent

1. Open **Test microphone / grant access** and grant microphone permission to the extension.
2. Select the correct input device.
3. Speak and confirm the setup meter moves.
4. Check the browser and operating-system microphone privacy settings.
5. If microphone capture still fails, the meeting tab recording and Meet-caption capture may continue without the microphone track.

### Video playback or seeking is unavailable

- Confirm the recording finished finalization.
- Check that the meeting has a local video copy available.
- Large recordings need enough browser storage and disk space.
- WebM duration/CuePoint repair improves seeking but cannot guarantee identical behavior in every media player.

### AI request fails

- Confirm the selected provider matches the API key.
- Check that the key is active and has API access.
- Check provider quota/rate limits and billing.
- Clear an obsolete model ID to allow automatic model selection where supported.
- Remember that ChatGPT Plus/Pro subscriptions and OpenAI API billing are separate products.

## Development and verification

The project uses plain JavaScript, HTML and CSS; no build step is required for the extension's current source.

Run the available checks from the repository root:

```bash
node --check background.js
node --check content.js
node --check offscreen.js
node --check sidepanel.js
node --check setup.js
node --test
python -c "import json; json.load(open('manifest.json', encoding='utf-8'))"
```

The transcript tests cover rolling caption updates, overlap stitching, duplicate suppression, speaker-turn merging, long incremental transcripts, transcript formatting and AI-provider host permissions.

### Important validation note

Automated syntax, unit and manifest checks do not replace testing in a real Google Meet session. After changing capture or transcription code, verify caption attachment, speaker labels, pause/resume timing, microphone selection, local speech-pack behavior, long recordings, video seeking and transcript exports in the target Chrome environment. Browser speech APIs, capture constraints and codec support vary by platform.

## Project structure

```text
.
├── manifest.json
├── background.js
├── content.js
├── offscreen.html
├── offscreen.js
├── sidepanel.html
├── sidepanel.js
├── setup.html
├── setup.js
├── ai.html
├── ai.js
├── ai.css
├── lib/
│   └── transcript.js
└── tests/
    ├── ai-config.test.js
    └── transcript-merge.test.js
```

---

**Meet Notebook is a local-first meeting recorder and transcript workspace.** Its primary speaker-labelled transcript comes from Google Meet captions; optional Chrome on-device dictation adds a separate local-user speech track; and AI analysis is opt-in.
