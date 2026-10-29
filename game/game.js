import "./game.css";

import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker
} from "@mediapipe/tasks-vision";


/* =========================================
   ELEMENTS
========================================= */

const gameStart =
  document.querySelector("#gameStart");

const calibration =
  document.querySelector("#calibration");

const allowCamera =
  document.querySelector(".allow-camera");

const cameraVideo =
  document.querySelector("#cameraVideo");

const trackingCanvas =
  document.querySelector("#trackingCanvas");

const ctx =
  trackingCanvas.getContext("2d");

const trackingStage =
  document.querySelector(".scan-human");

const trackingText =
  document.querySelector(".tracking strong");

const calibrationLabel =
  document.querySelector(".calibration-label");

const calibrationDesc =
  document.querySelector(".calibration-desc");


/* =========================================
   FULLSCREEN SIGNAL GAME ELEMENTS
========================================= */

const signalGame =
  document.querySelector("#signalGame");

const gameTrackingCanvas =
  document.querySelector("#gameTrackingCanvas");

const gameCtx =
  gameTrackingCanvas
    ? gameTrackingCanvas.getContext("2d")
    : null;

const gameOrbLayer =
  document.querySelector("#gameOrbLayer");

const gameCountdown =
  document.querySelector("#gameCountdown");

const gameScoreText =
  document.querySelector("#gameScore");

const gameTimerText =
  document.querySelector("#gameTimer");

const catchFeedback =
  document.querySelector("#catchFeedback");


/* =========================================
   CALIBRATION HUMAN
   기존 game-human 이미지를
   자동으로 하나 만들어 넣음
========================================= */

const calibrationHuman =
  document.createElement("div");

calibrationHuman.className =
  "calibration-human";

trackingStage.prepend(
  calibrationHuman
);


/* =========================================
   STATE
========================================= */

let cameraStream = null;

let handLandmarker = null;

let poseLandmarker = null;

let trackingStarted = false;

let calibrationComplete = false;

let trackingProgress = 0;

let lastVideoTime = -1;

let lastProgressTime =
  performance.now();

let frameCount = 0;

let particles = [];

let currentSystemState = "";


/* fullscreen game state */

let gameMode = false;
let gameRunning = false;

let gameScore = 0;
let gameTimeLeft = 30;

let gameStartTime = 0;
let lastGameFrameTime = 0;
let lastOrbSpawnTime = 0;

let activeOrbs = [];

let latestPose = null;
let latestHands = [];


/* avatar smoothing */

let avatarX = 0;
let avatarY = 0;
let avatarRotation = 0;
let avatarScale = 1;


/* =========================================
   HAND CONNECTIONS
========================================= */

const HAND_CONNECTIONS = [

  [0,1],
  [1,2],
  [2,3],
  [3,4],

  [0,5],
  [5,6],
  [6,7],
  [7,8],

  [5,9],
  [9,10],
  [10,11],
  [11,12],

  [9,13],
  [13,14],
  [14,15],
  [15,16],

  [13,17],
  [17,18],
  [18,19],
  [19,20],

  [0,17]

];
let bodyDataParticles = [];


/* =========================================
   POSE CONNECTIONS
========================================= */

const BODY_CONNECTIONS = [

  /* shoulders */
  [11,12],

  /* left arm */
  [11,13],
  [13,15],

  /* right arm */
  [12,14],
  [14,16],

  /* torso */
  [11,23],
  [12,24],
  [23,24],

  /* legs */
  [23,25],
  [25,27],

  [24,26],
  [26,28]

];


/* =========================================
   GAME START
========================================= */

gameStart.addEventListener(
  "click",
  () => {

    calibration.classList.add(
      "active"
    );

  }
);


/* =========================================
   CAMERA ACCESS
========================================= */

allowCamera.addEventListener(
  "click",
  async () => {

    /*
      calibration이 끝난 뒤 같은 버튼을
      ENTER RETUNE 버튼으로 재사용
    */

    if (calibrationComplete) {

      startSignalGame();

      return;

    }


    if (cameraStream) {
      return;
    }


    allowCamera.disabled = true;

    allowCamera.textContent =
      "REQUESTING ACCESS...";

    calibrationLabel.textContent =
      "CONNECTING SIGNAL";


    try {

      cameraStream =
        await navigator.mediaDevices
          .getUserMedia({

            video: {

              facingMode:
                "user",

              width: {
                ideal: 1280
              },

              height: {
                ideal: 720
              }

            },

            audio: false

          });


      cameraVideo.srcObject =
        cameraStream;


      await cameraVideo.play();


      calibration.classList.add(
        "camera-ready"
      );


      calibrationLabel.textContent =
        "LOADING MOTION SYSTEM";


      calibrationDesc.innerHTML =
        "카메라가 연결되었습니다.<br>RETUNE 모션 시스템을 준비합니다.";


      allowCamera.textContent =
        "INITIALIZING...";


      await initializeTracking();


      calibration.classList.add(
        "scanning",
        "motion-tracking"
      );


      trackingStarted = true;


      allowCamera.textContent =
        "MOVE INTO FRAME";


      calibrationLabel.textContent =
        "BODY SIGNAL SEARCHING";


      calibrationDesc.innerHTML =
        "상체와 양손이 보이도록 위치를 맞춰주세요.";


      lastProgressTime =
        performance.now();


      requestAnimationFrame(
        runTracking
      );

    }


    catch (error) {

      console.error(
        "CAMERA / TRACKING ERROR:",
        error
      );


      allowCamera.disabled = false;

      allowCamera.textContent =
        "TRY AGAIN →";


      calibrationLabel.textContent =
        "ACCESS REQUIRED";


      calibrationDesc.innerHTML =
        "카메라 접근 권한이 필요합니다.<br>브라우저에서 카메라 사용을 허용해주세요.";

    }

  }
);


/* =========================================
   MEDIAPIPE INITIALIZE
========================================= */

async function initializeTracking() {

  const vision =
    await FilesetResolver.forVisionTasks(

      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.1/wasm"

    );


  /*
    HAND TRACKER
  */

  handLandmarker =
    await HandLandmarker.createFromOptions(

      vision,

      {

        baseOptions: {

          modelAssetPath:

            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

        },


        runningMode:
          "VIDEO",


        numHands:
          2,


        minHandDetectionConfidence:
          0.5,


        minHandPresenceConfidence:
          0.5,


        minTrackingConfidence:
          0.5

      }

    );


  /*
    BODY / POSE TRACKER

    full 모델을 사용해서
    움직임 정확도를 우선함.
  */

  poseLandmarker =
    await PoseLandmarker.createFromOptions(

      vision,

      {

        baseOptions: {

          modelAssetPath:

            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"

        },


        runningMode:
          "VIDEO",


        numPoses:
          1,


        minPoseDetectionConfidence:
          0.5,


        minPosePresenceConfidence:
          0.5,


        minTrackingConfidence:
          0.5

      }

    );


  console.log(
    "RETUNE MOTION SYSTEM READY"
  );

}


/* =========================================
   TRACKING LOOP
========================================= */

function runTracking(timestamp) {

  if (!trackingStarted) {
    return;
  }


  requestAnimationFrame(
    runTracking
  );


  if (
    !handLandmarker ||
    !poseLandmarker ||
    cameraVideo.readyState < 2
  ) {

    return;

  }


  /*
    같은 카메라 프레임을
    여러 번 계산하지 않게 함
  */

  if (
    cameraVideo.currentTime ===
    lastVideoTime
  ) {

    return;

  }


  lastVideoTime =
    cameraVideo.currentTime;


  const time =
    timestamp ||
    performance.now();


  const handResult =
    handLandmarker.detectForVideo(

      cameraVideo,
      time

    );


  const poseResult =
    poseLandmarker.detectForVideo(

      cameraVideo,
      time

    );


  const hands =
    handResult.landmarks || [];


  const pose =

    poseResult.landmarks &&
    poseResult.landmarks.length

      ? poseResult.landmarks[0]

      : null;


  /*
    게임에서도 같은 MediaPipe 결과를 재사용
  */

  latestPose =
    pose;

  latestHands =
    hands;


  updateCalibration(
    pose,
    hands
  );


  if (gameMode) {

    drawGameTracking(
      pose,
      hands
    );

  }

  else {

    drawTracking(
      pose,
      hands
    );


    updateAvatar(
      pose
    );

  }


  frameCount += 1;

}


/* =========================================
   CALIBRATION
========================================= */

function updateCalibration(
  pose,
  hands
) {

  if (calibrationComplete) {
    return;
  }


  const now =
    performance.now();


  const delta =
    Math.min(

      (
        now -
        lastProgressTime
      ) / 1000,

      0.05

    );


  lastProgressTime =
    now;


  const bodyDetected =
    Boolean(pose);


  const handCount =
    hands.length;


  /*
    상태별 안내
  */

  if (!bodyDetected) {

    setSystemState(
      "NO_BODY"
    );


    trackingProgress -=
      16 * delta;

  }


  else if (
    bodyDetected &&
    handCount === 0
  ) {

    setSystemState(
      "BODY_ONLY"
    );


    trackingProgress +=
      2 * delta;

  }


  else if (
    bodyDetected &&
    handCount === 1
  ) {

    setSystemState(
      "ONE_HAND"
    );


    trackingProgress +=
      7 * delta;

  }


  else {

    setSystemState(
      "FULL_SIGNAL"
    );


    /*
      몸 + 양손 모두 인식되면
      약 3초대에 100%
    */

    trackingProgress +=
      30 * delta;

  }


  trackingProgress =
    Math.max(

      0,

      Math.min(
        100,
        trackingProgress
      )

    );


  const value =
    Math.round(
      trackingProgress
    );


  trackingText.textContent =
    `${value}%`;


  trackingStage.style.setProperty(

    "--tracking",

    value

  );


  if (
    trackingProgress >=
    100
  ) {

    finishCalibration();

  }

}


/* =========================================
   UI STATE
========================================= */

function setSystemState(
  state
) {

  if (
    currentSystemState ===
    state
  ) {

    return;

  }


  currentSystemState =
    state;


  if (
    state ===
    "NO_BODY"
  ) {

    calibrationLabel.textContent =
      "SEARCHING BODY SIGNAL";


    calibrationDesc.innerHTML =
      "카메라 안으로 이동해주세요.<br>상체가 화면 중앙에 보여야 합니다.";


    allowCamera.textContent =
      "MOVE INTO FRAME";

  }


  if (
    state ===
    "BODY_ONLY"
  ) {

    calibrationLabel.textContent =
      "BODY SIGNAL DETECTED";


    calibrationDesc.innerHTML =
      "신체 신호를 찾았습니다.<br>양손을 화면 안에 보여주세요.";


    allowCamera.textContent =
      "SHOW BOTH HANDS";

  }


  if (
    state ===
    "ONE_HAND"
  ) {

    calibrationLabel.textContent =
      "HAND SIGNAL DETECTED";


    calibrationDesc.innerHTML =
      "한쪽 손이 연결되었습니다.<br>반대쪽 손도 화면 안에 보여주세요.";


    allowCamera.textContent =
      "ONE MORE HAND";

  }


  if (
    state ===
    "FULL_SIGNAL"
  ) {

    calibrationLabel.textContent =
      "CALIBRATING MOTION";


    calibrationDesc.innerHTML =
      "움직임 신호를 분석하고 있습니다.<br>자연스럽게 양손을 움직여주세요.";


    allowCamera.textContent =
      "CALIBRATING...";

  }

}


/* =========================================
   CALIBRATION COMPLETE
========================================= */

function finishCalibration() {

  if (calibrationComplete) {
    return;
  }


  calibrationComplete =
    true;


  trackingProgress =
    100;


  trackingText.textContent =
    "100%";


  trackingStage.style.setProperty(
    "--tracking",
    100
  );


  calibration.classList.add(
    "signal-locked"
  );


  calibrationLabel.textContent =
    "SIGNAL LOCKED";


  calibrationDesc.innerHTML =
    "움직임 보정이 완료되었습니다.<br>RETUNE SIGNAL이 연결되었습니다.";


  allowCamera.textContent =
    "ENTER RETUNE →";


  allowCamera.disabled =
    false;


  allowCamera.classList.add(
    "is-connected"
  );

}
/* =========================================
   CANVAS
========================================= */

function resizeCanvas() {

  const width =
    trackingStage.clientWidth;

  const height =
    trackingStage.clientHeight;


  const dpr =
    Math.min(

      window.devicePixelRatio || 1,

      2

    );


  const pixelWidth =
    Math.round(
      width * dpr
    );


  const pixelHeight =
    Math.round(
      height * dpr
    );


  if (
    trackingCanvas.width !==
    pixelWidth ||
    trackingCanvas.height !==
    pixelHeight
  ) {

    trackingCanvas.width =
      pixelWidth;


    trackingCanvas.height =
      pixelHeight;

  }


  trackingCanvas.style.width =
    `${width}px`;


  trackingCanvas.style.height =
    `${height}px`;


  ctx.setTransform(
    1,0,0,1,0,0
  );


  ctx.clearRect(
    0,
    0,
    trackingCanvas.width,
    trackingCanvas.height
  );


  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );


  return {
    width,
    height
  };

}


/* =========================================
   CAMERA COORDINATE
========================================= */

function toScreenPoint(
  point,
  width,
  height
) {

  const videoWidth =
    cameraVideo.videoWidth;


  const videoHeight =
    cameraVideo.videoHeight;


  if (
    !videoWidth ||
    !videoHeight
  ) {

    return {
      x:0,
      y:0
    };

  }


  /*
    object-fit: cover와 동일한 계산
  */

  const scale =
    Math.max(

      width /
      videoWidth,

      height /
      videoHeight

    );


  const displayWidth =
    videoWidth *
    scale;


  const displayHeight =
    videoHeight *
    scale;


  const offsetX =
    (
      width -
      displayWidth
    ) / 2;


  const offsetY =
    (
      height -
      displayHeight
    ) / 2;


  /*
    selfie 카메라 좌우 반전
  */

  const x =
    1 - point.x;


  return {

    x:
      (
        x *
        videoWidth *
        scale
      ) +
      offsetX,

    y:
      (
        point.y *
        videoHeight *
        scale
      ) +
      offsetY

  };

}


/* =========================================
   DRAW TRACKING
========================================= */

function drawTracking(
  pose,
  hands
) {

  const {
    width,
    height
  } =
    resizeCanvas();


  /*
    이전 particle 먼저
  */

  drawParticles();


  /*
    BODY
  */

  if (pose) {

    drawPose(
      pose,
      width,
      height
    );

  }


  /*
    HANDS
  */

  hands.forEach(
    (hand) => {

      drawHand(
        hand,
        width,
        height
      );

    }
  );

}


/* =========================================
   DRAW POSE
========================================= */

function drawPose(
  pose,
  width,
  height
) {

  const points =
    pose.map(
      (point) =>

        toScreenPoint(
          point,
          width,
          height
        )
    );


  ctx.save();


  /*
    TORso glow 면
  */

  const torso = [
    points[11],
    points[12],
    points[24],
    points[23]
  ];


  ctx.beginPath();

  ctx.moveTo(
    torso[0].x,
    torso[0].y
  );


  torso
    .slice(1)
    .forEach(
      (point) => {

        ctx.lineTo(
          point.x,
          point.y
        );

      }
    );


  ctx.closePath();


  ctx.fillStyle =
    "rgba(125,255,0,0.045)";


  ctx.fill();


  /*
    skeleton
  */

  ctx.strokeStyle =
    "rgba(125,255,0,0.72)";


  ctx.lineWidth =
    1.8;


  ctx.shadowColor =
    "#7DFF00";


  ctx.shadowBlur =
    14;


  BODY_CONNECTIONS.forEach(
    ([a,b]) => {

      const p1 =
        points[a];


      const p2 =
        points[b];


      ctx.beginPath();

      ctx.moveTo(
        p1.x,
        p1.y
      );


      ctx.lineTo(
        p2.x,
        p2.y
      );


      ctx.stroke();

    }
  );


  /*
    주요 관절
  */

  const joints = [

    11,12,
    13,14,
    15,16,
    23,24

  ];


  joints.forEach(
    (index) => {

      const p =
        points[index];


      ctx.beginPath();


      ctx.arc(
        p.x,
        p.y,
        3.3,
        0,
        Math.PI * 2
      );


      ctx.fillStyle =
        "#7DFF00";


      ctx.shadowBlur =
        18;


      ctx.fill();

    }
  );


  /*
    머리 홀로그램 링
  */

  const nose =
    points[0];


  const leftShoulder =
    points[11];


  const rightShoulder =
    points[12];


  const shoulderDistance =
    Math.hypot(

      rightShoulder.x -
      leftShoulder.x,

      rightShoulder.y -
      leftShoulder.y

    );


  const headRadius =
    Math.max(
      18,
      shoulderDistance *
      0.20
    );


  ctx.beginPath();


  ctx.arc(
    nose.x,
    nose.y,
    headRadius,
    0,
    Math.PI * 2
  );


  ctx.strokeStyle =
    "rgba(240,255,230,0.52)";


  ctx.lineWidth =
    1;


  ctx.shadowColor =
    "#7DFF00";


  ctx.shadowBlur =
    20;


  ctx.stroke();


  /*
    wrists particle
  */

  if (
    frameCount % 2 ===
    0
  ) {

    createParticle(
      points[15].x,
      points[15].y
    );


    createParticle(
      points[16].x,
      points[16].y
    );

  }


  ctx.restore();

}


/* =========================================
   DRAW HAND
========================================= */

function drawHand(
  hand,
  width,
  height
) {

  const points =
    hand.map(
      (point) =>

        toScreenPoint(
          point,
          width,
          height
        )
    );


  ctx.save();


  /*
    손 관절 라인
  */

  ctx.lineWidth =
    1.4;


  ctx.strokeStyle =
    "rgba(245,255,238,0.96)";


  ctx.shadowColor =
    "#7DFF00";


  ctx.shadowBlur =
    14;


  HAND_CONNECTIONS.forEach(
    ([a,b]) => {

      const p1 =
        points[a];


      const p2 =
        points[b];


      ctx.beginPath();


      ctx.moveTo(
        p1.x,
        p1.y
      );


      ctx.lineTo(
        p2.x,
        p2.y
      );


      ctx.stroke();

    }
  );


  /*
    관절점
  */

  points.forEach(
    (point,index) => {

      const fingertip =

        [
          4,
          8,
          12,
          16,
          20
        ].includes(index);


      ctx.beginPath();


      ctx.arc(

        point.x,
        point.y,

        fingertip
          ? 4.2
          : 2.6,

        0,

        Math.PI * 2

      );


      ctx.fillStyle =
        fingertip
          ? "#F7FFF2"
          : "#7DFF00";


      ctx.shadowColor =
        "#7DFF00";


      ctx.shadowBlur =
        fingertip
          ? 22
          : 12;


      ctx.fill();

    }
  );


  /*
    fingertips particle
  */

  if (
    frameCount % 2 ===
    0
  ) {

    [
      4,
      8,
      12,
      16,
      20
    ].forEach(
      (index) => {

        createParticle(
          points[index].x,
          points[index].y
        );

      }
    );

  }


  ctx.restore();

}


/* =========================================
   HUMAN IMAGE FOLLOW
========================================= */

function updateAvatar(
  pose
) {

  if (!pose) {

    calibrationHuman.style.opacity =
      "0.13";

    return;

  }


  calibrationHuman.style.opacity =
    "0.24";


  const width =
    trackingStage.clientWidth;


  const height =
    trackingStage.clientHeight;


  const left =
    toScreenPoint(
      pose[11],
      width,
      height
    );


  const right =
    toScreenPoint(
      pose[12],
      width,
      height
    );


  const centerX =
    (
      left.x +
      right.x
    ) / 2;


  const centerY =
    (
      left.y +
      right.y
    ) / 2;


  const shoulderWidth =
    Math.hypot(

      right.x -
      left.x,

      right.y -
      left.y

    );


  const targetX =
    (
      centerX -
      width / 2
    ) *
    0.26;


  const targetY =
    (
      centerY -
      height * 0.40
    ) *
    0.20;


  const angle =

    Math.atan2(

      right.y -
      left.y,

      right.x -
      left.x

    ) *

    180 /
    Math.PI;


  const targetRotation =
    angle *
    0.38;


  const targetScale =
    clamp(

      shoulderWidth /
      (
        width *
        0.34
      ),

      0.91,

      1.12

    );


  /*
    움직임 smoothing
  */

  avatarX =
    lerp(
      avatarX,
      targetX,
      0.12
    );


  avatarY =
    lerp(
      avatarY,
      targetY,
      0.12
    );


  avatarRotation =
    lerp(
      avatarRotation,
      targetRotation,
      0.10
    );


  avatarScale =
    lerp(
      avatarScale,
      targetScale,
      0.08
    );


  calibrationHuman.style.transform =

    `
      translate(-50%, -50%)
      translate(
        ${avatarX}px,
        ${avatarY}px
      )
      rotate(
        ${avatarRotation}deg
      )
      scale(
        ${avatarScale}
      )
    `;

}


/* =========================================
   PARTICLES
========================================= */

function createParticle(
  x,
  y
) {

  if (
    particles.length >
    180
  ) {

    particles.shift();

  }


  particles.push({

    x:
      x +
      (
        Math.random() -
        0.5
      ) *
      8,

    y:
      y +
      (
        Math.random() -
        0.5
      ) *
      8,

    vx:
      (
        Math.random() -
        0.5
      ) *
      1.25,

    vy:
      -0.4 -
      Math.random() *
      1.1,

    size:
      0.7 +
      Math.random() *
      2.3,

    alpha:
      0.25 +
      Math.random() *
      0.65,

    life:
      1

  });

}


/* =========================================
   DRAW PARTICLES
========================================= */

function drawParticles() {

  ctx.save();


  particles =
    particles.filter(
      (particle) => {

        particle.x +=
          particle.vx;


        particle.y +=
          particle.vy;


        particle.life -=
          0.023;


        if (
          particle.life <=
          0
        ) {

          return false;

        }


        ctx.beginPath();


        ctx.arc(

          particle.x,
          particle.y,

          particle.size,

          0,

          Math.PI * 2

        );


        ctx.fillStyle =

          `rgba(
            125,
            255,
            0,
            ${
              particle.alpha *
              particle.life
            }
          )`;


        ctx.shadowColor =
          "#7DFF00";


        ctx.shadowBlur =
          10;


        ctx.fill();


        return true;

      }
    );


  ctx.restore();

}



/* =========================================
   FULLSCREEN RETUNE SIGNAL GAME
========================================= */

const GOOD_WORDS = [

  "건강",
  "수분",
  "운동",
  "균형",
  "회복",
  "단백질",
  "비타민",
  "활력"

];


const BAD_WORDS = [

  "야식",
  "수면부족",
  "스트레스",
  "과식",
  "설탕",
  "불규칙",
  "피로",
  "과도한 카페인"

];


/* =========================================
   GAME START
========================================= */

async function startSignalGame() {

  if (
    gameMode ||
    !signalGame ||
    !gameTrackingCanvas ||
    !gameOrbLayer
  ) {

    return;

  }


  gameMode =
    true;


  calibration.classList.remove(
    "active"
  );


  signalGame.classList.add(
    "active"
  );


  gameScore =
    0;


  gameTimeLeft =
    30;


  if (gameScoreText) {
    gameScoreText.textContent =
      "000";
  }


  if (gameTimerText) {
    gameTimerText.textContent =
      "30";
  }


  activeOrbs.forEach(
    (orb) => {

      orb.element.remove();

    }
  );


  activeOrbs =
    [];


  gameOrbLayer.innerHTML =
    "";


  /*
    calibration canvas의 잔상 제거
  */

  ctx.clearRect(
    0,
    0,
    trackingCanvas.width,
    trackingCanvas.height
  );


  await runCountdown();


  gameRunning =
    true;


  gameStartTime =
    performance.now();


  lastGameFrameTime =
    gameStartTime;


  /*
    시작 직후 화면이 너무 비어 보이지 않게
    첫 오브젝트를 바로 하나 생성
  */

  spawnOrb();


  lastOrbSpawnTime =
    gameStartTime;


  requestAnimationFrame(
    updateGame
  );

}


/* =========================================
   3 / 2 / 1 / GAME START
========================================= */

function runCountdown() {

  return new Promise(
    (resolve) => {

      if (!gameCountdown) {

        resolve();

        return;

      }


      const sequence = [

        "3",
        "2",
        "1",
        "GAME<br>START"

      ];


      const text =
        gameCountdown.querySelector(
          "strong"
        );


      if (!text) {

        resolve();

        return;

      }


      let index =
        0;


      gameCountdown.classList.add(
        "active"
      );


      function showNext() {

        text.innerHTML =
          sequence[index];


        text.style.animation =
          "none";


        void text.offsetWidth;


        text.style.animation =
          "";


        index +=
          1;


        if (
          index <
          sequence.length
        ) {

          setTimeout(
            showNext,
            780
          );

        }

        else {

          setTimeout(
            () => {

              gameCountdown.classList.remove(
                "active"
              );


              resolve();

            },
            820
          );

        }

      }


      showNext();

    }
  );

}


/* =========================================
   MAIN GAME LOOP
========================================= */

function updateGame(
  now
) {

  if (!gameRunning) {
    return;
  }


  const delta =
    Math.min(
      (
        now -
        lastGameFrameTime
      ) /
      1000,

      0.05
    );


  lastGameFrameTime =
    now;


  const elapsed =
    (
      now -
      gameStartTime
    ) /
    1000;


  gameTimeLeft =
    Math.max(
      0,
      30 -
      elapsed
    );


  if (gameTimerText) {
    gameTimerText.textContent =
      String(
        Math.ceil(
          gameTimeLeft
        )
      ).padStart(
        2,
        "0"
      );
  }


  /*
    약 0.95초마다 하나 생성
  */

  if (
    now -
    lastOrbSpawnTime >=
    780
  ) {

    spawnOrb();


    lastOrbSpawnTime =
      now;

  }


  updateOrbs(
    delta,
    now
  );


  if (
    gameTimeLeft <=
    0
  ) {

    finishGame();

    return;

  }


  requestAnimationFrame(
    updateGame
  );

}


/* =========================================
   ORB SPAWN
========================================= */

function spawnOrb() {

  const isGood =
    Math.random() <
    0.42;


  const wordList =
    isGood
      ? GOOD_WORDS
      : BAD_WORDS;


  const word =
    wordList[
      Math.floor(
        Math.random() *
        wordList.length
      )
    ];


  const element =
    document.createElement(
      "div"
    );


  element.className =
    `signal-orb ${
      isGood
        ? "good"
        : "bad"
    }`;


  element.innerHTML =
    `
      <img
        src="${
          isGood
            ? "/orb-green.png"
            : "/orb-gray.png"
        }"
        alt=""
        draggable="false"
      >

      <span>
        ${word}
      </span>
    `;


  gameOrbLayer.appendChild(
    element
  );


  const side =
    Math.floor(
      Math.random() *
      4
    );


  const difficultyBoost =
  Math.min(
    1,
    gameScore / 100
  );


const speed =
  0.22 +
  Math.random() *
  0.09 +
  difficultyBoost *
  0.06;


  let x;
  let y;
  let vx;
  let vy;


  if (side === 0) {

    x =
      -0.12;

    y =
      0.16 +
      Math.random() *
      0.70;

    vx =
      speed;

    vy =
      (
        Math.random() -
        0.5
      ) *
      0.055;

  }


  else if (side === 1) {

    x =
      1.12;

    y =
      0.16 +
      Math.random() *
      0.70;

    vx =
      -speed;

    vy =
      (
        Math.random() -
        0.5
      ) *
      0.055;

  }


  else if (side === 2) {

    x =
      0.10 +
      Math.random() *
      0.80;

    y =
      -0.14;

    vx =
      (
        Math.random() -
        0.5
      ) *
      0.055;

    vy =
      speed;

  }


  else {

    x =
      0.10 +
      Math.random() *
      0.80;

    y =
      1.14;

    vx =
      (
        Math.random() -
        0.5
      ) *
      0.055;

    vy =
      -speed;

  }


  activeOrbs.push({

    element,

    isGood,

    x,
    y,

    vx,
    vy,

    radius:
      0.060,

    caught:
      false,

    born:
      performance.now(),

    phase:
      Math.random() *
      Math.PI *
      2

  });

}


/* =========================================
   ORB MOVE + COLLISION
========================================= */

function updateOrbs(
  delta,
  now
) {

  const width =
    window.innerWidth;


  const height =
    window.innerHeight;


  const handPoints =
    getGameHandPoints(
      latestHands
    );


  activeOrbs =
    activeOrbs.filter(
      (orb) => {

        if (orb.caught) {

          return true;

        }


        orb.x +=
          orb.vx *
          delta;


        orb.y +=
          orb.vy *
          delta;


        const age =
          (
            now -
            orb.born
          ) /
          1000;


        const floatX =
          Math.sin(
            age *
            1.7 +
            orb.phase
          ) *
          0.012;


        const floatY =
          Math.cos(
            age *
            1.25 +
            orb.phase
          ) *
          0.010;


        const renderX =
          orb.x +
          floatX;


        const renderY =
          orb.y +
          floatY;


        orb.element.style.left =
          `${renderX * 100}%`;


        orb.element.style.top =
          `${renderY * 100}%`;


        /*
          초록 signal만 점수 획득
        */

        if (
          orb.isGood &&
          handPoints.length
        ) {

          const orbX =
            renderX *
            width;


          const orbY =
            renderY *
            height;


          const orbRadius =
            Math.max(
              48,

              Math.min(
                width,
                height
              ) *
              orb.radius
            );


          for (
            const handPoint
            of handPoints
          ) {

            const distance =
              Math.hypot(

                handPoint.x -
                orbX,

                handPoint.y -
                orbY

              );


            if (
              distance <
              orbRadius +
              handPoint.radius
            ) {

              catchOrb(
                orb,
                handPoint
              );

              break;

            }

          }

        }


        if (
          orb.x <
          -0.28 ||
          orb.x >
          1.28 ||
          orb.y <
          -0.28 ||
          orb.y >
          1.28
        ) {

          orb.element.remove();

          return false;

        }


        return true;

      }
    );

}


/* =========================================
   HAND HIT AREA
========================================= */
function getGameHandPoints(
  hands
) {

  const points =
    [];


  const ids = [

    0,

    5,
    9,
    13,
    17,

    4,
    8,
    12,
    16,
    20

  ];


  hands.forEach(
    (hand) => {

      ids.forEach(
        (index) => {

          const point =
            hand[index];


          if (!point) {
            return;
          }


          points.push({

            x:
              (
                1 -
                point.x
              ) *
              window.innerWidth,

            y:
              point.y *
              window.innerHeight,

            radius:
              [
                4,
                8,
                12,
                16,
                20
              ].includes(index)

                ? 34

                : 26

          });

        }
      );

    }
  );


  return points;

}


/* =========================================
   CATCH
========================================= */

function catchOrb(
  orb,
  handPoint
) {

  if (
    orb.caught ||
    !gameRunning
  ) {

    return;

  }


  orb.caught =
    true;


  orb.element.classList.add(
    "caught"
  );


  gameScore =
    Math.min(
      100,
      gameScore +
      10
    );


  if (gameScoreText) {

    gameScoreText.textContent =
      String(
        gameScore
      ).padStart(
        3,
        "0"
      );

  }


  showCatchFeedback(
    handPoint.x,
    handPoint.y
  );


  setTimeout(
    () => {

      orb.element.remove();


      activeOrbs =
        activeOrbs.filter(
          (item) =>

            item !==
            orb
        );

    },
    430
  );

}


/* =========================================
   +10 FEEDBACK
========================================= */

function showCatchFeedback(
  x,
  y
) {

  if (!catchFeedback) {
    return;
  }


  catchFeedback.style.left =
    `${x}px`;


  catchFeedback.style.top =
    `${y}px`;


  catchFeedback.classList.remove(
    "show"
  );


  void catchFeedback.offsetWidth;


  catchFeedback.classList.add(
    "show"
  );

}


/* =========================================
   FULLSCREEN TRACKING CANVAS
========================================= */

function resizeGameCanvas() {

  if (
    !gameTrackingCanvas ||
    !gameCtx
  ) {

    return {
      width: 0,
      height: 0,
      dpr: 1
    };

  }


  const width =
    window.innerWidth;


  const height =
    window.innerHeight;


  const dpr =
    Math.min(
      window.devicePixelRatio ||
      1,

      2
    );


  const pixelWidth =
    Math.round(
      width *
      dpr
    );


  const pixelHeight =
    Math.round(
      height *
      dpr
    );


  if (
    gameTrackingCanvas.width !==
    pixelWidth ||
    gameTrackingCanvas.height !==
    pixelHeight
  ) {

    gameTrackingCanvas.width =
      pixelWidth;


    gameTrackingCanvas.height =
      pixelHeight;

  }


  gameTrackingCanvas.style.width =
    `${width}px`;


  gameTrackingCanvas.style.height =
    `${height}px`;


  gameCtx.setTransform(
    1,
    0,
    0,
    1,
    0,
    0
  );


  gameCtx.clearRect(
    0,
    0,
    gameTrackingCanvas.width,
    gameTrackingCanvas.height
  );


  gameCtx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );


  return {
    width,
    height,
    dpr
  };

}


/* =========================================
   FULLSCREEN CAMERA COORDINATE
========================================= */

function toGamePoint(
  point,
  width,
  height
) {

  return {

    x:
      (
        1 -
        point.x
      ) *
      width,

    y:
      point.y *
      height

  };

}


/* =========================================
   DRAW FULLSCREEN TRACKING
========================================= */

function drawGameTracking(
  pose,
  hands
) {

  if (
    !gameMode ||
    !gameCtx
  ) {

    return;

  }


  const {
    width,
    height
  } =
    resizeGameCanvas();


  if (pose) {

    const centerGlow =
      gameCtx.createRadialGradient(

        width *
        0.5,

        height *
        0.52,

        20,

        width *
        0.5,

        height *
        0.52,

        height *
        0.43

      );


    centerGlow.addColorStop(
      0,

      "rgba(125,255,0,0.095)"
    );


    centerGlow.addColorStop(
      1,

      "rgba(125,255,0,0)"
    );


    gameCtx.fillStyle =
      centerGlow;


    gameCtx.fillRect(
      0,
      0,
      width,
      height
    );


    drawGamePose(
      pose,
      width,
      height
    );

  }


  hands.forEach(
    (hand) => {

      drawGameHand(
        hand,
        width,
        height
      );

    }
  );

}


/* =========================================
   GAME POSE
========================================= */

function drawGamePose(
  pose,
  width,
  height
) {

  function drawBodyLimb(
  pointA,
  pointB,
  width
) {

  if (
    !pointA ||
    !pointB
  ) {

    return;

  }


  gameCtx.save();


  gameCtx.beginPath();


  gameCtx.moveTo(
    pointA.x,
    pointA.y
  );


  gameCtx.lineTo(
    pointB.x,
    pointB.y
  );


  gameCtx.lineCap =
    "round";


  gameCtx.lineWidth =
    width;


  gameCtx.strokeStyle =
    "rgba(125,255,0,.075)";


  gameCtx.shadowColor =
    "#7DFF00";


  gameCtx.shadowBlur =
    32;


  gameCtx.stroke();


  /*
    안쪽의 얇은 핵심 라인
  */

  gameCtx.lineWidth =
    2;


  gameCtx.strokeStyle =
    "rgba(125,255,0,.52)";


  gameCtx.shadowBlur =
    15;


  gameCtx.stroke();


  gameCtx.restore();

}

  const points =
    pose.map(
      (point) =>

        toGamePoint(
          point,
          width,
          height
        )
    );
    if (
  frameCount % 3 ===
  0
) {

  const particlePoints = [

    points[11],
    points[12],

    points[13],
    points[14],

    points[15],
    points[16],

    points[23],
    points[24],

    points[25],
    points[26],

    points[27],
    points[28]

  ];


  const randomPoint =
    particlePoints[
      Math.floor(
        Math.random() *
        particlePoints.length
      )
    ];


  createBodyDataParticle(
    randomPoint
  );

}


drawBodyDataParticles();


  gameCtx.save();


  /* =========================================
   DATA BODY SILHOUETTE
========================================= */

const leftShoulder =
  points[11];

const rightShoulder =
  points[12];

const leftElbow =
  points[13];

const rightElbow =
  points[14];

const leftWrist =
  points[15];

const rightWrist =
  points[16];

const leftHip =
  points[23];

const rightHip =
  points[24];

const leftKnee =
  points[25];

const rightKnee =
  points[26];

const leftAnkle =
  points[27];

const rightAnkle =
  points[28];


/*
  중심 몸통
*/

gameCtx.beginPath();

gameCtx.moveTo(
  leftShoulder.x,
  leftShoulder.y
);

gameCtx.lineTo(
  rightShoulder.x,
  rightShoulder.y
);

gameCtx.lineTo(
  rightHip.x,
  rightHip.y
);

gameCtx.lineTo(
  leftHip.x,
  leftHip.y
);

gameCtx.closePath();


const bodyGradient =
  gameCtx.createLinearGradient(

    leftShoulder.x,
    leftShoulder.y,

    rightHip.x,
    rightHip.y

  );


bodyGradient.addColorStop(
  0,
  "rgba(125,255,0,.17)"
);

bodyGradient.addColorStop(
  .55,
  "rgba(125,255,0,.095)"
);

bodyGradient.addColorStop(
  1,
  "rgba(125,255,0,.025)"
);


gameCtx.fillStyle =
  bodyGradient;


gameCtx.shadowColor =
  "#7DFF00";


gameCtx.shadowBlur =
  38;


gameCtx.fill();


/*
  팔을 두꺼운 glow line으로 만들어
  면처럼 보이게 함
*/

drawBodyLimb(
  leftShoulder,
  leftElbow,
  34
);

drawBodyLimb(
  leftElbow,
  leftWrist,
  28
);


drawBodyLimb(
  rightShoulder,
  rightElbow,
  34
);

drawBodyLimb(
  rightElbow,
  rightWrist,
  28
);


/*
  다리
*/

drawBodyLimb(
  leftHip,
  leftKnee,
  46
);

drawBodyLimb(
  leftKnee,
  leftAnkle,
  34
);


drawBodyLimb(
  rightHip,
  rightKnee,
  46
);

drawBodyLimb(
  rightKnee,
  rightAnkle,
  34
);

  if (
    torso.every(Boolean)
  ) {

    gameCtx.beginPath();


    gameCtx.moveTo(
      torso[0].x,
      torso[0].y
    );


    torso
      .slice(1)
      .forEach(
        (point) => {

          gameCtx.lineTo(
            point.x,
            point.y
          );

        }
      );


    gameCtx.closePath();


    gameCtx.fillStyle =
      "rgba(125,255,0,0.055)";


    gameCtx.shadowColor =
      "#7DFF00";


    gameCtx.shadowBlur =
      32;


    gameCtx.fill();

  }


  gameCtx.strokeStyle =
    "rgba(125,255,0,0.78)";


  gameCtx.lineWidth =
    2;


  gameCtx.shadowColor =
    "#7DFF00";


  gameCtx.shadowBlur =
    18;


  BODY_CONNECTIONS.forEach(
    ([a,b]) => {

      const p1 =
        points[a];


      const p2 =
        points[b];


      if (
        !p1 ||
        !p2
      ) {

        return;

      }


      gameCtx.beginPath();


      gameCtx.moveTo(
        p1.x,
        p1.y
      );


      gameCtx.lineTo(
        p2.x,
        p2.y
      );


      gameCtx.stroke();

    }
  );


  [
    11,
    12,
    13,
    14,
    15,
    16,
    23,
    24
  ].forEach(
    (index) => {

      const point =
        points[index];


      if (!point) {
        return;
      }


      gameCtx.beginPath();


      gameCtx.arc(
        point.x,
        point.y,
        3.5,
        0,
        Math.PI * 2
      );


      gameCtx.fillStyle =
        "#7DFF00";


      gameCtx.fill();

    }
  );


  gameCtx.restore();

}


/* =========================================
   GAME HANDS
========================================= */

function drawGameHand(
  hand,
  width,
  height
) {

  const points =
    hand.map(
      (point) =>

        toGamePoint(
          point,
          width,
          height
        )
    );


  gameCtx.save();


  gameCtx.strokeStyle =
    "rgba(248,255,244,0.98)";


  gameCtx.fillStyle =
    "#ffffff";


  gameCtx.lineWidth =
    2;


  gameCtx.shadowColor =
    "#7DFF00";


  gameCtx.shadowBlur =
    18;


  HAND_CONNECTIONS.forEach(
    ([a,b]) => {

      const p1 =
        points[a];


      const p2 =
        points[b];


      if (
        !p1 ||
        !p2
      ) {

        return;

      }


      gameCtx.beginPath();


      gameCtx.moveTo(
        p1.x,
        p1.y
      );


      gameCtx.lineTo(
        p2.x,
        p2.y
      );


      gameCtx.stroke();

    }
  );


  points.forEach(
    (point,index) => {

      const fingertip =
        [
          4,
          8,
          12,
          16,
          20
        ].includes(index);


      gameCtx.beginPath();


      gameCtx.arc(
        point.x,
        point.y,
        fingertip
          ? 4.2
          : 2.7,
        0,
        Math.PI *
        2
      );


      gameCtx.fillStyle =
        fingertip
          ? "#ffffff"
          : "#7DFF00";


      gameCtx.shadowBlur =
        fingertip
          ? 24
          : 14;


      gameCtx.fill();

    }
  );


  gameCtx.restore();

}


/* =========================================
   GAME FINISH
========================================= */

function finishGame() {

  if (!gameRunning) {
    return;
  }


  gameRunning =
    false;


  gameTimeLeft =
    0;


  if (gameTimerText) {

    gameTimerText.textContent =
      "00";

  }


  activeOrbs.forEach(
    (orb) => {

      orb.element.style.transition =
        "opacity .45s ease";


      orb.element.style.opacity =
        "0";

    }
  );


  setTimeout(
    () => {

      gameOrbLayer.innerHTML =
        "";


      activeOrbs =
        [];

    },
    480
  );


  if (gameCountdown) {

    const text =
      gameCountdown.querySelector(
        "strong"
      );


    if (text) {
text.innerHTML =
  `
    <span
      style="
        display:block;
        font-size:0.16em;
        letter-spacing:.22em;
        margin-bottom:22px;
        color:white;
        opacity:.55;
      "
    >
      SIGNAL COMPLETE
    </span>

    ${String(gameScore).padStart(3,"0")}

    <button
      class="game-retry"
      id="gameRetry"
    >
      RETRY →
    </button>
  `;


      gameCountdown.classList.add(
        "active"
      );

    }

  }

setTimeout(
  () => {

    const retryButton =
      document.querySelector(
        "#gameRetry"
      );


    if (!retryButton) {
      return;
    }


    retryButton.addEventListener(
      "click",
      retrySignalGame
    );

  },
  0
);

  console.log(
    "RETUNE GAME COMPLETE:",
    gameScore
  );

}


/* =========================================
   HELPERS
========================================= */

function clamp(
  value,
  min,
  max
) {

  return Math.min(

    Math.max(
      value,
      min
    ),

    max

  );

}


function lerp(
  start,
  end,
  amount
) {

  return start +
    (
      end -
      start
    ) *
    amount;

}

/* =========================================
   CLEANUP
========================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (cameraStream) {

      cameraStream
        .getTracks()
        .forEach(
          (track) => {

            track.stop();

          }
        );

    }


    if (handLandmarker) {

      handLandmarker.close();

    }


    if (poseLandmarker) {

      poseLandmarker.close();

    }

  }
);
/* =========================================
   BODY DATA PARTICLES
========================================= */

function createBodyDataParticle(
  point
) {

  if (!point) {
    return;
  }


  if (
    bodyDataParticles.length >
    85
  ) {

    bodyDataParticles.shift();

  }


  bodyDataParticles.push({

    x:
      point.x +
      (
        Math.random() -
        .5
      ) *
      55,

    y:
      point.y +
      (
        Math.random() -
        .5
      ) *
      55,

    size:
      5 +
      Math.random() *
      16,

    life:
      1,

    driftX:
      (
        Math.random() -
        .5
      ) *
      .7,

    driftY:
      (
        Math.random() -
        .5
      ) *
      .7

  });

}


/* =========================================
   DRAW BODY DATA
========================================= */

function drawBodyDataParticles() {

  gameCtx.save();


  bodyDataParticles =
    bodyDataParticles.filter(
      (particle) => {

        particle.x +=
          particle.driftX;


        particle.y +=
          particle.driftY;


        particle.life -=
          .025;


        if (
          particle.life <=
          0
        ) {

          return false;

        }


        gameCtx.strokeStyle =
          `rgba(
            125,
            255,
            0,
            ${
              particle.life *
              .42
            }
          )`;


        gameCtx.lineWidth =
          1;


        gameCtx.shadowColor =
          "#7DFF00";


        gameCtx.shadowBlur =
          7;


        gameCtx.strokeRect(

          particle.x,

          particle.y,

          particle.size,

          particle.size

        );


        return true;

      }
    );


  gameCtx.restore();

}
function retrySignalGame() {

  gameCountdown.classList.remove(
    "active"
  );


  /*
    result 화면을 다시
    countdown 구조로 복구
  */

  gameCountdown.innerHTML =
    `
      <strong>
        3
      </strong>
    `;


  gameMode =
    false;


  gameRunning =
    false;


  gameStartTime =
    0;


  gameScore =
    0;


  gameTimeLeft =
    30;


  activeOrbs.forEach(
    (orb) => {

      orb.element.remove();

    }
  );


  activeOrbs =
    [];


  bodyDataParticles =
    [];


  gameOrbLayer.innerHTML =
    "";


  /*
    카메라 calibration은 이미 끝났으므로
    다시 할 필요 없이 바로 게임 재시작
  */

  setTimeout(
    () => {

      startSignalGame();

    },
    180
  );

}
/* =========================================================
   RETUNE FINAL PATCH
   기존 game.js 맨 아래에 그대로 추가
========================================================= */

let faceLandmarkerV2 = null;
let latestFaceV2 = null;

const gameCameraVideoV2 =
  document.querySelector("#gameCameraVideo");


const FACE_OVAL_V2 = [
  10,338,297,332,284,251,389,356,454,323,361,288,397,365,
  379,378,400,377,152,148,176,149,150,136,172,58,132,93,
  234,127,162,21,54,103,67,109
];

const LEFT_EYE_V2 = [
  33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246
];

const RIGHT_EYE_V2 = [
  362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398
];

const LEFT_BROW_V2 = [
  70,63,105,66,107,55,65,52,53,46
];

const RIGHT_BROW_V2 = [
  336,296,334,293,300,285,295,282,283,276
];

const LIPS_V2 = [
  61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,
  14,87,178,88,95,78,191,80,81,82,13,312,311,310,415
];

const NOSE_LINE_V2 = [
  168,6,197,195,5,4,1,19,94,2
];

const NOSE_WINGS_V2 = [
  98,97,2,326,327
];


/* =========================
   MEDIAPIPE + FACE
========================= */

initializeTracking = async function () {

  const vision =
    await FilesetResolver.forVisionTasks(

      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.1/wasm"

    );


  handLandmarker =
    await HandLandmarker.createFromOptions(

      vision,

      {

        baseOptions: {

          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

        },

        runningMode:
          "VIDEO",

        numHands:
          2,

        minHandDetectionConfidence:
          0.5,

        minHandPresenceConfidence:
          0.5,

        minTrackingConfidence:
          0.5

      }

    );


  poseLandmarker =
    await PoseLandmarker.createFromOptions(

      vision,

      {

        baseOptions: {

          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"

        },

        runningMode:
          "VIDEO",

        numPoses:
          1,

        minPoseDetectionConfidence:
          0.5,

        minPosePresenceConfidence:
          0.5,

        minTrackingConfidence:
          0.5

      }

    );


  const {
    FaceLandmarker
  } =
    await import(
      "@mediapipe/tasks-vision"
    );


  faceLandmarkerV2 =
    await FaceLandmarker.createFromOptions(

      vision,

      {

        baseOptions: {

          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

        },

        runningMode:
          "VIDEO",

        numFaces:
          1,

        minFaceDetectionConfidence:
          0.5,

        minFacePresenceConfidence:
          0.5,

        minTrackingConfidence:
          0.5,

        outputFaceBlendshapes:
          false,

        outputFacialTransformationMatrixes:
          false

      }

    );


  console.log(
    "RETUNE MOTION + FACE SYSTEM READY"
  );

};


/* =========================
   TRACKING LOOP
========================= */

runTracking = function (
  timestamp
) {

  if (!trackingStarted) {
    return;
  }


  requestAnimationFrame(
    runTracking
  );


  if (
    !handLandmarker ||
    !poseLandmarker ||
    !faceLandmarkerV2 ||
    cameraVideo.readyState < 2
  ) {

    return;

  }


  if (
    cameraVideo.currentTime ===
    lastVideoTime
  ) {

    return;

  }


  lastVideoTime =
    cameraVideo.currentTime;


  const time =
    timestamp ||
    performance.now();


  const handResult =
    handLandmarker.detectForVideo(
      cameraVideo,
      time
    );


  const poseResult =
    poseLandmarker.detectForVideo(
      cameraVideo,
      time
    );


  const faceResult =
    faceLandmarkerV2.detectForVideo(
      cameraVideo,
      time
    );


  const hands =
    handResult.landmarks || [];


  const pose =
    poseResult.landmarks &&
    poseResult.landmarks.length

      ? poseResult.landmarks[0]

      : null;


  const face =
    faceResult.faceLandmarks &&
    faceResult.faceLandmarks.length

      ? faceResult.faceLandmarks[0]

      : null;


  latestPose =
    pose;

  latestHands =
    hands;

  latestFaceV2 =
    face;


  updateCalibration(
    pose,
    hands
  );


  if (gameMode) {

    drawGameTracking(
      pose,
      hands,
      face
    );

  }

  else {

    drawTracking(
      pose,
      hands,
      face
    );


    updateAvatar(
      pose
    );

  }


  frameCount += 1;

};


/* =========================
   FACE DRAW
========================= */

function drawFaceTrackingV2(
  targetCtx,
  face,
  converter,
  scale = 1
) {

  if (
    !face ||
    !face.length
  ) {

    return;

  }


  const points =
    face.map(
      converter
    );


  targetCtx.save();


  targetCtx.lineWidth =
    1.15 *
    scale;


  targetCtx.strokeStyle =
    "rgba(245,255,238,0.82)";


  targetCtx.fillStyle =
    "#7DFF00";


  targetCtx.shadowColor =
    "#7DFF00";


  targetCtx.shadowBlur =
    11 *
    scale;


  const drawPath =
    (
      indices,
      close = true
    ) => {

      const valid =
        indices
          .map(
            (i) =>
              points[i]
          )
          .filter(Boolean);


      if (
        valid.length <
        2
      ) {

        return;

      }


      targetCtx.beginPath();


      targetCtx.moveTo(
        valid[0].x,
        valid[0].y
      );


      for (
        let i = 1;
        i < valid.length;
        i++
      ) {

        targetCtx.lineTo(
          valid[i].x,
          valid[i].y
        );

      }


      if (close) {

        targetCtx.closePath();

      }


      targetCtx.stroke();

    };


  drawPath(
    FACE_OVAL_V2,
    true
  );


  drawPath(
    LEFT_EYE_V2,
    true
  );


  drawPath(
    RIGHT_EYE_V2,
    true
  );


  drawPath(
    LEFT_BROW_V2,
    false
  );


  drawPath(
    RIGHT_BROW_V2,
    false
  );


  drawPath(
    LIPS_V2,
    true
  );


  drawPath(
    NOSE_LINE_V2,
    false
  );


  drawPath(
    NOSE_WINGS_V2,
    false
  );


  const dots = [

    10,
    152,

    33,
    133,

    362,
    263,

    70,
    107,

    336,
    300,

    1,
    2,
    4,

    61,
    291,

    13,
    14

  ];


  dots.forEach(
    (index) => {

      const point =
        points[index];


      if (!point) {
        return;
      }


      targetCtx.beginPath();


      targetCtx.arc(
        point.x,
        point.y,
        1.7 *
        scale,
        0,
        Math.PI * 2
      );


      targetCtx.fill();

    }
  );


  targetCtx.restore();

}


/* =========================
   CALIBRATION DRAW
========================= */

drawTracking = function (
  pose,
  hands,
  face = latestFaceV2
) {

  const {
    width,
    height
  } =
    resizeCanvas();


  drawParticles();


  if (pose) {

    drawPose(
      pose,
      width,
      height
    );

  }


  if (face) {

    drawFaceTrackingV2(

      ctx,

      face,

      (point) =>
        toScreenPoint(
          point,
          width,
          height
        ),

      1

    );

  }


  hands.forEach(
    (hand) => {

      drawHand(
        hand,
        width,
        height
      );

    }
  );

};


/* =========================
   BODY = LINE ONLY
========================= */

drawPose = function (
  pose,
  width,
  height
) {

  const points =
    pose.map(
      (point) =>
        toScreenPoint(
          point,
          width,
          height
        )
    );


  ctx.save();


  ctx.strokeStyle =
    "rgba(125,255,0,0.76)";


  ctx.lineWidth =
    1.8;


  ctx.shadowColor =
    "#7DFF00";


  ctx.shadowBlur =
    14;


  BODY_CONNECTIONS.forEach(
    ([a,b]) => {

      const p1 =
        points[a];


      const p2 =
        points[b];


      if (
        !p1 ||
        !p2
      ) {

        return;

      }


      ctx.beginPath();


      ctx.moveTo(
        p1.x,
        p1.y
      );


      ctx.lineTo(
        p2.x,
        p2.y
      );


      ctx.stroke();

    }
  );


  [
    11,12,
    13,14,
    15,16,
    23,24,
    25,26,
    27,28

  ].forEach(
    (index) => {

      const point =
        points[index];


      if (!point) {
        return;
      }


      ctx.beginPath();


      ctx.arc(
        point.x,
        point.y,
        3.2,
        0,
        Math.PI * 2
      );


      ctx.fillStyle =
        "#7DFF00";


      ctx.shadowBlur =
        18;


      ctx.fill();

    }
  );


  if (
    frameCount %
    2 ===
    0
  ) {

    if (
      points[15]
    ) {

      createParticle(
        points[15].x,
        points[15].y
      );

    }


    if (
      points[16]
    ) {

      createParticle(
        points[16].x,
        points[16].y
      );

    }

  }


  ctx.restore();

};


/* =========================
   GAME CAMERA + START
========================= */

startSignalGame =
async function () {

  if (
    gameMode ||
    !signalGame ||
    !gameTrackingCanvas ||
    !gameOrbLayer
  ) {

    return;

  }


  gameMode =
    true;


  calibration.classList.remove(
    "active"
  );


  signalGame.classList.add(
    "active"
  );


  if (
    gameCameraVideoV2 &&
    cameraStream
  ) {

    if (
      gameCameraVideoV2.srcObject !==
      cameraStream
    ) {

      gameCameraVideoV2.srcObject =
        cameraStream;

    }


    try {

      await gameCameraVideoV2.play();

    }

    catch (error) {

      console.warn(
        "GAME CAMERA PLAY WARNING:",
        error
      );

    }

  }


  gameScore =
    0;


  gameTimeLeft =
    30;


  if (gameScoreText) {

    gameScoreText.textContent =
      "000";

  }


  if (gameTimerText) {

    gameTimerText.textContent =
      "30";

  }


  activeOrbs.forEach(
    (orb) => {

      orb.element.remove();

    }
  );


  activeOrbs =
    [];


  gameOrbLayer.innerHTML =
    "";


  ctx.clearRect(
    0,
    0,
    trackingCanvas.width,
    trackingCanvas.height
  );


  await runCountdown();


  gameRunning =
    true;


  gameStartTime =
    performance.now();


  lastGameFrameTime =
    gameStartTime;


  spawnOrb();


  lastOrbSpawnTime =
    gameStartTime;


  requestAnimationFrame(
    updateGame
  );

};


/* =========================
   COUNTDOWN
========================= */

runCountdown =
function () {

  return new Promise(
    (resolve) => {

      if (!gameCountdown) {

        resolve();

        return;

      }


      gameCountdown.classList.remove(
        "result-mode"
      );


      gameCountdown.innerHTML =
        `<strong>3</strong>`;


      const sequence = [

        "3",
        "2",
        "1",
        "GAME<br>START"

      ];


      const text =
        gameCountdown.querySelector(
          "strong"
        );


      let index =
        0;


      gameCountdown.classList.add(
        "active"
      );


      function showNext() {

        text.innerHTML =
          sequence[index];


        text.style.animation =
          "none";


        void text.offsetWidth;


        text.style.animation =
          "";


        index +=
          1;


        if (
          index <
          sequence.length
        ) {

          setTimeout(
            showNext,
            720
          );

        }

        else {

          setTimeout(
            () => {

              gameCountdown.classList.remove(
                "active"
              );


              resolve();

            },
            720
          );

        }

      }


      showNext();

    }
  );

};


/* =========================
   GAME COORDINATES
========================= */

toGamePoint =
function (
  point,
  width,
  height
) {

  const videoWidth =
    cameraVideo.videoWidth ||
    1280;


  const videoHeight =
    cameraVideo.videoHeight ||
    720;


  const scale =
    Math.max(

      width /
      videoWidth,

      height /
      videoHeight

    );


  const displayWidth =
    videoWidth *
    scale;


  const displayHeight =
    videoHeight *
    scale;


  const offsetX =
    (
      width -
      displayWidth
    ) / 2;


  const offsetY =
    (
      height -
      displayHeight
    ) / 2;


  const mirroredX =
    1 -
    point.x;


  return {

    x:
      mirroredX *
      videoWidth *
      scale +
      offsetX,

    y:
      point.y *
      videoHeight *
      scale +
      offsetY

  };

};


/* =========================
   GAME HAND HIT AREA
========================= */

getGameHandPoints =
function (
  hands
) {

  const points =
    [];


  const ids = [

    0,

    5,
    9,
    13,
    17,

    4,
    8,
    12,
    16,
    20

  ];


  hands.forEach(
    (hand) => {

      ids.forEach(
        (index) => {

          const point =
            hand[index];


          if (!point) {
            return;
          }


          const converted =
            toGamePoint(

              point,

              window.innerWidth,

              window.innerHeight

            );


          points.push({

            x:
              converted.x,

            y:
              converted.y,

            radius:
              [
                4,
                8,
                12,
                16,
                20
              ].includes(index)

                ? 34

                : 26

          });

        }
      );

    }
  );


  return points;

};
/* =========================
   GAME TRACKING DRAW
========================= */

drawGameTracking =
function (
  pose,
  hands,
  face = latestFaceV2
) {

  if (
    !gameMode ||
    !gameCtx
  ) {

    return;

  }


  const {
    width,
    height
  } =
    resizeGameCanvas();


  /*
    몸 = 선 + 관절점
  */

  if (pose) {

    drawGamePose(
      pose,
      width,
      height
    );

  }


  /*
    얼굴 = 실제 얼굴 위에
    얼굴형 / 눈 / 눈썹 / 코 / 입 선점
  */

  if (face) {

    drawFaceTrackingV2(

      gameCtx,

      face,

      (point) =>
        toGamePoint(
          point,
          width,
          height
        ),

      1.1

    );

  }


  /*
    손 = 기존 detailed hand tracking 유지
  */

  hands.forEach(
    (hand) => {

      drawGameHand(
        hand,
        width,
        height
      );

    }
  );

};


/* =========================
   GAME BODY = LINE ONLY
========================= */

drawGamePose =
function (
  pose,
  width,
  height
) {

  const points =
    pose.map(
      (point) =>
        toGamePoint(
          point,
          width,
          height
        )
    );


  gameCtx.save();


  gameCtx.strokeStyle =
    "rgba(125,255,0,0.78)";


  gameCtx.lineWidth =
    2;


  gameCtx.shadowColor =
    "#7DFF00";


  gameCtx.shadowBlur =
    18;


  BODY_CONNECTIONS.forEach(
    ([a,b]) => {

      const p1 =
        points[a];


      const p2 =
        points[b];


      if (
        !p1 ||
        !p2
      ) {

        return;

      }


      gameCtx.beginPath();


      gameCtx.moveTo(
        p1.x,
        p1.y
      );


      gameCtx.lineTo(
        p2.x,
        p2.y
      );


      gameCtx.stroke();

    }
  );


  [
    11,12,
    13,14,
    15,16,
    23,24,
    25,26,
    27,28
  ].forEach(
    (index) => {

      const point =
        points[index];


      if (!point) {
        return;
      }


      gameCtx.beginPath();


      gameCtx.arc(
        point.x,
        point.y,
        3.5,
        0,
        Math.PI *
        2
      );


      gameCtx.fillStyle =
        "#7DFF00";


      gameCtx.shadowBlur =
        18;


      gameCtx.fill();

    }
  );


  gameCtx.restore();

};


/* =========================
   ORB SPAWN
   good 68%
   bad 32%
========================= */

spawnOrb =
function () {

  const isGood =
    Math.random() <
    0.68;


  const wordList =
    isGood
      ? GOOD_WORDS
      : BAD_WORDS;


  const word =
    wordList[
      Math.floor(
        Math.random() *
        wordList.length
      )
    ];


  const element =
    document.createElement(
      "div"
    );


  element.className =
    `signal-orb ${
      isGood
        ? "good"
        : "bad"
    }`;


  element.innerHTML =
    `
      <img
        src="${
          isGood
            ? "/orb-green.png"
            : "/orb-gray.png"
        }"
        alt=""
        draggable="false"
      >

      <span>
        ${word}
      </span>
    `;


  gameOrbLayer.appendChild(
    element
  );


  const side =
    Math.floor(
      Math.random() *
      4
    );


  /*
    초록은 더 빠르게,
    회색은 조금 느리게
  */

  const goodSpeed =
    0.285 +
    Math.random() *
    0.105;


  const badSpeed =
    0.19 +
    Math.random() *
    0.07;


  const speed =
    isGood
      ? goodSpeed
      : badSpeed;


  let x;
  let y;
  let vx;
  let vy;


  if (side === 0) {

    x =
      -0.12;

    y =
      0.16 +
      Math.random() *
      0.70;

    vx =
      speed;

    vy =
      (
        Math.random() -
        0.5
      ) *
      0.07;

  }


  else if (side === 1) {

    x =
      1.12;

    y =
      0.16 +
      Math.random() *
      0.70;

    vx =
      -speed;

    vy =
      (
        Math.random() -
        0.5
      ) *
      0.07;

  }


  else if (side === 2) {

    x =
      0.10 +
      Math.random() *
      0.80;

    y =
      -0.14;

    vx =
      (
        Math.random() -
        0.5
      ) *
      0.07;

    vy =
      speed;

  }


  else {

    x =
      0.10 +
      Math.random() *
      0.80;

    y =
      1.14;

    vx =
      (
        Math.random() -
        0.5
      ) *
      0.07;

    vy =
      -speed;

  }


  activeOrbs.push({

    element,

    isGood,

    x,
    y,

    vx,
    vy,

    radius:
      0.060,

    caught:
      false,

    born:
      performance.now(),

    phase:
      Math.random() *
      Math.PI *
      2

  });

};


/* =========================
   ORB UPDATE + COLLISION
========================= */

updateOrbs =
function (
  delta,
  now
) {

  const width =
    window.innerWidth;


  const height =
    window.innerHeight;


  const handPoints =
    getGameHandPoints(
      latestHands
    );


  activeOrbs =
    activeOrbs.filter(
      (orb) => {

        if (orb.caught) {

          return true;

        }


        orb.x +=
          orb.vx *
          delta;


        orb.y +=
          orb.vy *
          delta;


        const age =
          (
            now -
            orb.born
          ) /
          1000;


        const floatX =
          Math.sin(
            age *
            1.8 +
            orb.phase
          ) *
          0.012;


        const floatY =
          Math.cos(
            age *
            1.3 +
            orb.phase
          ) *
          0.010;


        const renderX =
          orb.x +
          floatX;


        const renderY =
          orb.y +
          floatY;


        orb.element.style.left =
          `${renderX * 100}%`;


        orb.element.style.top =
          `${renderY * 100}%`;


        const orbX =
          renderX *
          width;


        const orbY =
          renderY *
          height;


        const orbRadius =
          Math.max(

            48,

            Math.min(
              width,
              height
            ) *
            orb.radius

          );


        /*
          good / bad 둘 다 충돌 체크
        */

        if (
          handPoints.length
        ) {

          for (
            const handPoint
            of handPoints
          ) {

            const distance =
              Math.hypot(

                handPoint.x -
                orbX,

                handPoint.y -
                orbY

              );


            if (
              distance <
              orbRadius +
              handPoint.radius
            ) {

              catchOrb(
                orb,
                handPoint
              );

              break;

            }

          }

        }


        if (
          orb.x <
          -0.28 ||
          orb.x >
          1.28 ||
          orb.y <
          -0.28 ||
          orb.y >
          1.28
        ) {

          orb.element.remove();

          return false;

        }


        return true;

      }
    );

};


/* =========================
   GOOD +10 / BAD -5
========================= */

catchOrb =
function (
  orb,
  handPoint
) {

  if (
    orb.caught ||
    !gameRunning
  ) {

    return;

  }


  orb.caught =
    true;


  orb.element.classList.add(
    "caught"
  );


  if (orb.isGood) {

    gameScore =
      Math.min(
        100,
        gameScore +
        10
      );


    showCatchFeedbackV2(
      handPoint.x,
      handPoint.y,
      "+10",
      false
    );

  }

  else {

    gameScore =
      Math.max(
        0,
        gameScore -
        5
      );


    showCatchFeedbackV2(
      handPoint.x,
      handPoint.y,
      "-5",
      true
    );

  }


  if (gameScoreText) {

    gameScoreText.textContent =
      String(
        gameScore
      ).padStart(
        3,
        "0"
      );

  }


  setTimeout(
    () => {

      orb.element.remove();


      activeOrbs =
        activeOrbs.filter(
          (item) =>
            item !==
            orb
        );

    },
    430
  );

};


/* =========================
   SCORE FEEDBACK
========================= */

function showCatchFeedbackV2(
  x,
  y,
  value,
  negative
) {

  if (!catchFeedback) {
    return;
  }


  catchFeedback.textContent =
    value;


  catchFeedback.style.left =
    `${x}px`;


  catchFeedback.style.top =
    `${y}px`;


  catchFeedback.classList.toggle(
    "negative",
    negative
  );


  catchFeedback.classList.remove(
    "show"
  );


  void catchFeedback.offsetWidth;


  catchFeedback.classList.add(
    "show"
  );

}


/* =========================
   GAME LOOP
========================= */

updateGame =
function (
  now
) {

  if (!gameRunning) {
    return;
  }


  const delta =
    Math.min(
      (
        now -
        lastGameFrameTime
      ) /
      1000,
      0.05
    );


  lastGameFrameTime =
    now;


  const elapsed =
    (
      now -
      gameStartTime
    ) /
    1000;


  gameTimeLeft =
    Math.max(
      0,
      30 -
      elapsed
    );


  if (gameTimerText) {

    gameTimerText.textContent =
      String(
        Math.ceil(
          gameTimeLeft
        )
      ).padStart(
        2,
        "0"
      );

  }


  /*
    기존보다 더 자주 등장
  */

  if (
    now -
    lastOrbSpawnTime >=
    690
  ) {

    spawnOrb();


    lastOrbSpawnTime =
      now;

  }


  updateOrbs(
    delta,
    now
  );


  if (
    gameTimeLeft <=
    0
  ) {

    finishGame();

    return;

  }


  requestAnimationFrame(
    updateGame
  );

};


/* =========================
   RESULT
========================= */

finishGame =
function () {

  if (!gameRunning) {
    return;
  }


  gameRunning =
    false;


  gameTimeLeft =
    0;


  if (gameTimerText) {

    gameTimerText.textContent =
      "00";

  }


  activeOrbs.forEach(
    (orb) => {

      orb.element.style.transition =
        "opacity .42s ease";


      orb.element.style.opacity =
        "0";

    }
  );


  setTimeout(
    () => {

      if (gameOrbLayer) {

        gameOrbLayer.innerHTML =
          "";

      }


      activeOrbs =
        [];

    },
    450
  );


  if (gameCountdown) {

    gameCountdown.classList.add(
      "result-mode"
    );


  gameCountdown.innerHTML =
  `
    <div class="game-result">

      <div
        class="game-result-label"
      >
        SIGNAL COMPLETE
      </div>


      <div
        class="game-result-score"
      >
        ${scoreDisplay}
      </div>


      <div
        class="rank-entry"
        id="rankEntry"
      >

        <input
          class="rank-name-input"
          id="rankNameInput"
          type="text"
          maxlength="12"
          autocomplete="off"
          placeholder="ENTER NICKNAME"
          aria-label="nickname"
        >


        <button
          class="rank-submit"
          id="rankSubmit"
          type="button"
        >
          ENTER →
        </button>

      </div>


     <div
  class="ranking-result"
  id="rankingResult"
></div>


<div class="result-actions">

  <button
    class="game-retry"
    id="gameRetry"
    type="button"
  >
    RETRY →
  </button>


  <button
    class="game-exit"
    id="gameExit"
    type="button"
  >
    BACK TO RETUNE
  </button>

</div>

        <button
          class="game-exit"
          id="gameExit"
          type="button"
        >
          BACK TO RETUNE
        </button>

      </div>
      const retryButton =
  document.querySelector(
    "#gameRetry"
  );


const exitButton =
  document.querySelector(
    "#gameExit"
  );

    </div>
  `;

    gameCountdown.classList.add(
      "active"
    );


    const retryButton =
      gameCountdown.querySelector(
        "#gameRetry"
      );

    

      const exitButton =
  document.querySelector(
    "#gameExit"
  );

    if (retryButton) {

      retryButton.addEventListener(
        "click",
        retrySignalGameV2,
        {
          once: true
        }
      );

    }

  }
  if (exitButton) {

  exitButton.addEventListener(
    "click",
    exitRetuneGame,
    {
      once: true
    }
  );

}


  console.log(
    "RETUNE GAME COMPLETE:",
    gameScore
  );

};


/* =========================
   RETRY FIX
========================= */

async function retrySignalGameV2() {

  if (!gameCountdown) {
    return;
  }


  gameCountdown.classList.remove(
    "active",
    "result-mode"
  );


  gameCountdown.innerHTML =
    `<strong>3</strong>`;


  activeOrbs.forEach(
    (orb) => {

      orb.element.remove();

    }
  );


  activeOrbs =
    [];


  if (gameOrbLayer) {

    gameOrbLayer.innerHTML =
      "";

  }


  gameScore =
    0;


  gameTimeLeft =
    30;


  if (gameScoreText) {

    gameScoreText.textContent =
      "000";

  }


  if (gameTimerText) {

    gameTimerText.textContent =
      "30";

  }


  /*
    startSignalGame는 gameMode=true이면
    return하도록 되어 있으므로
    재시작 직전에 false로 돌려줌
  */

  gameMode =
    false;


  gameRunning =
    false;


  gameStartTime =
    0;


  lastOrbSpawnTime =
    0;


  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        160
      )
  );


  await startSignalGame();

}


/* =========================
   CLEANUP FACE
========================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (faceLandmarkerV2) {

      try {

        faceLandmarkerV2.close();

      }

      catch (error) {

        console.warn(
          "FACE CLEANUP WARNING:",
          error
        );

      }

    }

  }
);
/* =========================================================
   RETUNE UNLIMITED SCORE + LOCAL RANKING
========================================================= */

const RETUNE_RANK_KEY =
  "retune_signal_ranking_v1";


/* =========================================
   GOOD +10 / BAD -5
   100점 제한 제거
========================================= */

catchOrb =
function (
  orb,
  handPoint
) {

  if (
    orb.caught ||
    !gameRunning
  ) {

    return;

  }


  orb.caught =
    true;


  orb.element.classList.add(
    "caught"
  );


  if (orb.isGood) {

    /*
      무제한 점수
    */

    gameScore +=
      10;


    showCatchFeedbackV2(
      handPoint.x,
      handPoint.y,
      "+10",
      false
    );

  }

  else {

    gameScore =
      Math.max(
        0,
        gameScore -
        5
      );


    showCatchFeedbackV2(
      handPoint.x,
      handPoint.y,
      "-5",
      true
    );

  }


  if (gameScoreText) {

    gameScoreText.textContent =
      String(
        gameScore
      ).padStart(
        3,
        "0"
      );

  }


  setTimeout(
    () => {

      orb.element.remove();


      activeOrbs =
        activeOrbs.filter(
          (item) =>
            item !==
            orb
        );

    },
    430
  );

};


/* =========================================
   RANKING STORAGE
========================================= */

function getRetuneRanking() {

  try {

    const saved =
      localStorage.getItem(
        RETUNE_RANK_KEY
      );


    if (!saved) {

      return [];

    }


    const ranking =
      JSON.parse(
        saved
      );


    return Array.isArray(
      ranking
    )
      ? ranking
      : [];

  }

  catch (error) {

    console.warn(
      "RANKING LOAD ERROR:",
      error
    );


    return [];

  }

}


/* =========================================
   SAVE SCORE
========================================= */

function saveRetuneScore(
  name,
  score
) {

  const ranking =
    getRetuneRanking();


  const entry = {

    id:
      `${Date.now()}-${Math.random()}`,

    name,

    score,

    time:
      Date.now()

  };


  ranking.push(
    entry
  );


  /*
    높은 점수 우선

    동점이면
    먼저 기록된 사람이 위
  */

  ranking.sort(
    (a,b) => {

      if (
        b.score !==
        a.score
      ) {

        return (
          b.score -
          a.score
        );

      }


      return (
        a.time -
        b.time
      );

    }
  );


  /*
    전시장 하루 정도 사용하면
    기록이 많이 쌓일 수 있으므로
    내부 저장은 최대 100명까지만
  */

  const trimmed =
    ranking.slice(
      0,
      100
    );


  localStorage.setItem(

    RETUNE_RANK_KEY,

    JSON.stringify(
      trimmed
    )

  );


  const rank =
    trimmed.findIndex(
      (item) =>
        item.id ===
        entry.id
    ) +
    1;


  return {

    ranking:
      trimmed,

    rank,

    entry

  };

}


/* =========================================
   RANKING HTML
========================================= */

function renderRetuneRanking(
  data
) {

  const resultBox =
    document.querySelector(
      "#rankingResult"
    );


  if (!resultBox) {
    return;
  }


  /*
    화면에는 TOP 10
  */

  const topTen =
    data.ranking.slice(
      0,
      10
    );


  const rows =
    topTen
      .map(
        (
          item,
          index
        ) => {

          const isCurrent =
            item.id ===
            data.entry.id;


          return `
            <div
              class="
                ranking-row
                ${
                  isCurrent
                    ? "current"
                    : ""
                }
              "
            >

              <span
                class="ranking-position"
              >
                ${String(index + 1).padStart(2,"0")}
              </span>

              <span
                class="ranking-name"
              >
                ${escapeRankingHTML(item.name)}
              </span>

              <strong
                class="ranking-score"
              >
                ${String(item.score).padStart(3,"0")}
              </strong>

            </div>
          `;

        }
      )
      .join("");


  resultBox.innerHTML =
    `
      <div class="your-rank">
        YOUR RANK —
        ${
          data.rank > 0
            ? `#${String(data.rank).padStart(2,"0")}`
            : "OUT OF RANGE"
        }
      </div>

      <div class="ranking-title">
        TOP SIGNAL
      </div>

      <div class="ranking-list">
        ${rows}
      </div>
    `;


  resultBox.classList.add(
    "active"
  );

}


/* =========================================
   HTML ESCAPE
========================================= */

function escapeRankingHTML(
  value
) {

  return String(
    value
  )

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =========================================
   GAME FINISH + NICKNAME
========================================= */

finishGame =
function () {

  if (!gameRunning) {
    return;
  }


  gameRunning =
    false;


  gameTimeLeft =
    0;


  if (gameTimerText) {

    gameTimerText.textContent =
      "00";

  }


  activeOrbs.forEach(
    (orb) => {

      orb.element.style.transition =
        "opacity .42s ease";


      orb.element.style.opacity =
        "0";

    }
  );


  setTimeout(
    () => {

      if (gameOrbLayer) {

        gameOrbLayer.innerHTML =
          "";

      }


      activeOrbs =
        [];

    },
    450
  );


  if (!gameCountdown) {
    return;
  }


  gameCountdown.classList.add(
    "result-mode"
  );


  /*
    점수는 3자리 이하일 때만
    앞에 0을 붙임.

    1000 이상이면 그대로 표시.
  */

  const scoreDisplay =
    gameScore <
    1000

      ? String(
          gameScore
        ).padStart(
          3,
          "0"
        )

      : String(
          gameScore
        );


  gameCountdown.innerHTML =
    `
      <div class="game-result">

        <div
          class="game-result-label"
        >
          SIGNAL COMPLETE
        </div>


        <div
          class="game-result-score"
        >
          ${scoreDisplay}
        </div>


        <div
          class="rank-entry"
          id="rankEntry"
        >

          <input
            class="rank-name-input"
            id="rankNameInput"
            type="text"
            maxlength="12"
            autocomplete="off"
            placeholder="ENTER NICKNAME"
            aria-label="nickname"
          >


          <button
            class="rank-submit"
            id="rankSubmit"
            type="button"
          >
            ENTER →
          </button>

        </div>


        <div
          class="ranking-result"
          id="rankingResult"
        ></div>


        <button
          class="game-retry"
          id="gameRetry"
          type="button"
        >
          RETRY →
        </button>

      </div>
    `;


  gameCountdown.classList.add(
    "active"
  );


  const input =
    document.querySelector(
      "#rankNameInput"
    );


  const submit =
    document.querySelector(
      "#rankSubmit"
    );


  const entryBox =
    document.querySelector(
      "#rankEntry"
    );


  const retryButton =
    document.querySelector(
      "#gameRetry"
    );


  let saved =
    false;


  function submitRanking() {

    if (saved) {
      return;
    }


    let nickname =
      input
        ?.value
        .trim() ||
      "PLAYER";


    /*
      지나치게 긴 공백 등 정리
    */

    nickname =
      nickname
        .replace(
          /\s+/g,
          " "
        )
        .slice(
          0,
          12
        );


    saved =
      true;


    const result =
      saveRetuneScore(
        nickname,
        gameScore
      );


    if (entryBox) {

      entryBox.classList.add(
        "saved"
      );

    }


    renderRetuneRanking(
      result
    );

  }


  if (submit) {

    submit.addEventListener(
      "click",
      submitRanking
    );

  }


  if (input) {

    setTimeout(
      () => {

        input.focus();

      },
      250
    );


    input.addEventListener(
      "keydown",
      (event) => {

        if (
          event.key ===
          "Enter"
        ) {

          submitRanking();

        }

      }
    );

  }


  if (retryButton) {

    retryButton.addEventListener(
      "click",
      retrySignalGameV2,
      {
        once: true
      }
    );

  }


  console.log(
    "RETUNE GAME COMPLETE:",
    gameScore
  );

};
function exitRetuneGame() {

  gameRunning =
    false;

  gameMode =
    false;


  activeOrbs.forEach(
    (orb) => {

      orb.element.remove();

    }
  );


  activeOrbs =
    [];


  if (gameOrbLayer) {

    gameOrbLayer.innerHTML =
      "";

  }


  if (gameCountdown) {

    gameCountdown.classList.remove(
      "active",
      "result-mode"
    );


    gameCountdown.innerHTML =
      `<strong>3</strong>`;

  }


  if (signalGame) {

    signalGame.classList.remove(
      "active"
    );

  }


  /*
    원래 RETUNE 게임 첫 화면으로 복귀
  */

  if (gameStart) {

    gameStart.disabled =
      false;

  }


  /*
    혹시 camera video가 게임 화면에서 재생 중이어도
    카메라 스트림 자체는 유지.
    다시 시작할 때 calibration 없이도 사용 가능.
  */

}