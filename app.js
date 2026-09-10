const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");

const language = document.getElementById("language");

const statusEl = document.getElementById("status");
const finalTextEl = document.getElementById("finalText");
const liveTextEl = document.getElementById("liveText");

const finalWordsEl = document.getElementById("finalWords");
const liveWordsEl = document.getElementById("liveWords");

const sessionTimeEl = document.getElementById("sessionTime");
const supportMessage = document.getElementById("supportMessage");


const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;


let recognition = null;

let finalText = "";
let liveText = "";

let sessionStart = 0;
let timer = null;

let running = false;


/* --------------------------------
   SUPPORT CHECK
-------------------------------- */

if (!SpeechRecognition) {

    startBtn.disabled = true;

    supportMessage.textContent =
        "Speech recognition is not supported in this browser.";

}


/* --------------------------------
   CREATE RECOGNIZER
-------------------------------- */

function createRecognizer() {

    recognition = new SpeechRecognition();

    recognition.lang = language.value;

    recognition.continuous = true;

    recognition.interimResults = true;

    recognition.maxAlternatives = 1;


    recognition.onstart = () => {

        running = true;

        statusEl.textContent = "LISTENING";

        startBtn.disabled = true;

        stopBtn.disabled = false;

    };


    recognition.onresult = handleResult;


    recognition.onerror = (event) => {

        console.log("Speech error:", event.error);

        if (event.error === "not-allowed") {

            statusEl.textContent = "MIC DENIED";

        } else {

            statusEl.textContent =
                "ERROR: " + event.error;
        }

    };


    recognition.onend = () => {

        if (running) {

            /*
             * Browser speech recognition may stop
             * automatically.
             *
             * Restart while session is active.
             */

            try {

                recognition.start();

            } catch (e) {

                console.log(e);

            }

        } else {

            statusEl.textContent = "IDLE";

        }

    };
}


/* --------------------------------
   RESULT HANDLER
-------------------------------- */

function handleResult(event) {

    let interim = "";

    for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
    ) {

        const result = event.results[i];

        const text =
            result[0].transcript;

        if (result.isFinal) {

            finalText += text + " ";

        } else {

            interim += text;

        }

    }


    liveText = interim;

    render();

}


/* --------------------------------
   RENDER
-------------------------------- */

function render() {

    finalTextEl.textContent =
        finalText.trim();

    liveTextEl.textContent =
        liveText.trim();


    finalWordsEl.textContent =
        countWords(finalText);

    liveWordsEl.textContent =
        countWords(liveText);

}


/* --------------------------------
   WORD COUNT
-------------------------------- */

function countWords(text) {

    const cleaned =
        text.trim();

    if (!cleaned) {
        return 0;
    }

    return cleaned
        .split(/\s+/)
        .length;
}


/* --------------------------------
   START
-------------------------------- */

function startRecognition() {

    if (!SpeechRecognition) {
        return;
    }

    finalText = "";
    liveText = "";

    render();

    createRecognizer();

    running = true;

    sessionStart =
        Date.now();

    updateTimer();

    timer = setInterval(
        updateTimer,
        1000
    );

    try {

        recognition.start();

    } catch (e) {

        console.log(e);

    }

}


/* --------------------------------
   STOP
-------------------------------- */

function stopRecognition() {

    running = false;

    if (recognition) {

        try {

            recognition.stop();

        } catch (e) {

            console.log(e);

        }

    }

    if (timer) {

        clearInterval(timer);

        timer = null;

    }

    statusEl.textContent = "STOPPED";

    startBtn.disabled = false;

    stopBtn.disabled = true;

}


/* --------------------------------
   CLEAR
-------------------------------- */

function clearTranscript() {

    finalText = "";

    liveText = "";

    render();

}


/* --------------------------------
   TIMER
-------------------------------- */

function updateTimer() {

    if (!sessionStart) {
        return;
    }

    const seconds =
        Math.floor(
            (Date.now() - sessionStart) / 1000
        );

    const minutes =
        Math.floor(seconds / 60);

    const remain =
        seconds % 60;

    sessionTimeEl.textContent =
        String(minutes).padStart(2, "0")
        + ":"
        + String(remain).padStart(2, "0");

}


/* --------------------------------
   EVENTS
-------------------------------- */

startBtn.addEventListener(
    "click",
    startRecognition
);

stopBtn.addEventListener(
    "click",
    stopRecognition
);

clearBtn.addEventListener(
    "click",
    clearTranscript
);

language.addEventListener(
    "change",
    () => {

        if (running) {

            stopRecognition();

        }

        if (recognition) {

            recognition.lang =
                language.value;

        }

    }
);
