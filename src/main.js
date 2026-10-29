import "./style.css";

const video =
  document.querySelector("#tunnelVideo");

const loading =
  document.querySelector("#loading");


/* =========================
   설정값
========================= */

// 가만히 있을 때 자동으로 들어가는 속도
const IDLE_RATE = 0.75;

// 스크롤 반응 세기
const SCROLL_POWER = 0.006;

// 빠르게 스크롤했을 때 최대 이동 속도
const MAX_SCRUB_SPEED = 5.0;

// 스크롤 관성이 줄어드는 속도
const FRICTION = 6.5;

// 스크롤 손 뗀 뒤 자동재생으로 돌아가는 시간
const RESUME_DELAY = 220;

// 영상 마지막에서 멈추기 위한 여유
const END_PADDING = 0.05;

// 영상이 24fps
const SEEK_INTERVAL = 1000 / 24;


/* =========================
   상태값
========================= */

let duration = 0;
let playhead = 0;

let scrubVelocity = 0;

let isScrubbing = false;
let ready = false;

let lastWheelTime = 0;

let lastFrameTime =
  performance.now();

let lastSeekTime = 0;


/* =========================
   숫자 제한 함수
========================= */

function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max
  );
}


/* =========================
   영상 준비
========================= */

function initialiseVideo() {

  if (ready) return;

  if (
    !Number.isFinite(video.duration)
  ) {
    return;
  }

  duration = video.duration;

  playhead = 0;

  video.currentTime = 0;

  video.playbackRate =
    IDLE_RATE;

  ready = true;

  loading.style.display =
    "none";


  /*
    가만히 있을 때는
    일반 영상처럼 부드럽게 재생
  */

  video
    .play()
    .catch(() => {});


  requestAnimationFrame(update);
}


if (video.readyState >= 1) {

  initialiseVideo();

} else {

  video.addEventListener(
    "loadedmetadata",
    initialiseVideo,
    { once: true }
  );

}


/* =========================
   스크롤
========================= */

window.addEventListener(
  "wheel",
  (event) => {

    if (!ready) return;

    /*
      메인 HERO 화면이 아닐 때는
      터널 영상 스크롤 제어를 중지
    */
    if (
      document
        .querySelector("#brandSection")
        .classList.contains("is-active")
    ) {
      return;
    }

    event.preventDefault();

    let delta =
      event.deltaY;


    /*
      브라우저 / 마우스별
      스크롤 값 보정
    */

    if (event.deltaMode === 1) {
      delta *= 16;
    }

    if (event.deltaMode === 2) {
      delta *= window.innerHeight;
    }


    /*
      스크롤 시작 순간

      자동재생을 멈추고
      현재 위치부터 스크럽 시작
    */

    if (!isScrubbing) {

      isScrubbing = true;

      playhead =
        video.currentTime;

      video.pause();

    }


    /*
      핵심 부분

      천천히 스크롤하면 조금 이동
      빠르게 휙 스크롤하면
      훨씬 강하게 이동
    */

    const direction =
      Math.sign(delta);

    const strength =
      Math.pow(
        Math.abs(delta),
        1.15
      );


    scrubVelocity +=
      direction *
      strength *
      SCROLL_POWER;


    scrubVelocity =
      clamp(
        scrubVelocity,
        -MAX_SCRUB_SPEED,
        MAX_SCRUB_SPEED
      );


    lastWheelTime =
      performance.now();

  },
  {
    passive: false,
  }
);


/* =========================
   자동재생으로 복귀
========================= */

function resumeIdlePlayback() {

  isScrubbing = false;

  scrubVelocity = 0;


  video.currentTime =
    playhead;


  /*
    영상 끝이면
    처음으로 돌아가지 않고 정지
  */

  if (
    playhead >=
    duration - END_PADDING
  ) {

    video.currentTime =
      duration - END_PADDING;

    video.pause();

    return;
  }


  video.playbackRate =
    IDLE_RATE;


  video
    .play()
    .catch(() => {});
}


/* =========================
   애니메이션
========================= */

function update(now) {

  if (!ready) {

    requestAnimationFrame(update);
    return;

  }


  let deltaTime =
    (now - lastFrameTime) / 1000;


  lastFrameTime = now;


  deltaTime =
    Math.min(
      deltaTime,
      0.05
    );


  /* =====================
     스크롤 중
  ===================== */

  if (isScrubbing) {


    /*
      관성 자연스럽게 감소
    */

    scrubVelocity *=
      Math.exp(
        -FRICTION *
        deltaTime
      );


    /*
      스크롤 속도에 따라
      영상 위치 이동
    */

    playhead +=
      scrubVelocity *
      deltaTime;


    /*
      영상 처음 / 끝
      밖으로 못 넘어가게
    */

    playhead =
      clamp(
        playhead,
        0,
        duration - END_PADDING
      );


    /*
      실제 영상에 적용

      너무 자주 seek하지 않고
      영상 FPS 정도로만 갱신
    */

    if (
      now - lastSeekTime >=
        SEEK_INTERVAL &&
      !video.seeking
    ) {

      lastSeekTime = now;

      video.currentTime =
        playhead;

    }


    /*
      스크롤을 멈추면
      다시 천천히 자동재생
    */

    if (
      now - lastWheelTime >
      RESUME_DELAY
    ) {

      resumeIdlePlayback();

    }

  }


  /* =====================
     가만히 있는 상태
  ===================== */

  else {


    /*
      여기서는 currentTime을
      강제로 건드리지 않음.

      일반 video.play()라서
      부드럽게 움직임.
    */


    /*
      마지막에 도달하면 정지
    */

    if (
      video.currentTime >=
      duration - END_PADDING
    ) {

      video.currentTime =
        duration - END_PADDING;

      video.pause();

    }

  }


  requestAnimationFrame(update);
}
/* =========================
   SOUND CONTROL
========================= */

const soundControl =
  document.querySelector("#soundControl");

const bgm =
  document.querySelector("#bgm");


soundControl.addEventListener(
  "click",
  async () => {

    if (bgm.paused) {

      try {

        await bgm.play();

        soundControl.classList.add(
          "is-playing"
        );

      } catch (error) {

        console.error(
          "Audio playback failed:",
          error
        );

      }

    } else {

      bgm.pause();

      soundControl.classList.remove(
        "is-playing"
      );

    }

  }
);
/* =========================================
   SECTION TRANSITION
========================================= */

const hero =
  document.querySelector("#hero");

const brandSection =
  document.querySelector("#brandSection");

const goButton =
  document.querySelector("#goButton");

const backButton =
  document.querySelector("#backButton");



/* MAIN → BRAND */

goButton.addEventListener(
  "click",
  () => {

    /*
      터널 영상 잠깐 멈춤
    */
    video.pause();


    /*
      메인은 뒤로 빠지고
      brand 화면은 아래에서 올라옴
    */
    hero.classList.add(
      "is-leaving"
    );

    brandSection.classList.add(
      "is-active"
    );

  }
);



/* BRAND → MAIN */

backButton.addEventListener(
  "click",
  () => {

    brandSection.classList.remove(
      "is-active"
    );

    hero.classList.remove(
      "is-leaving"
    );


    /*
      전환이 어느 정도 끝난 뒤
      터널 다시 재생
    */
    setTimeout(
      () => {

        if (
          video.currentTime <
          duration - END_PADDING
        ) {

          video
            .play()
            .catch(() => {});

        }

      },
      650
    );

  }
);
/* =========================================
   CUSTOM CURSOR
========================================= */

const cursorLens =
  document.querySelector(
    "#cursorLens"
  );

const cursorDot =
  document.querySelector(
    "#cursorDot"
  );


let mouseX = 0;
let mouseY = 0;

let lensX = 0;
let lensY = 0;


/* 실제 마우스 위치 */

window.addEventListener(
  "mousemove",
  (event) => {

    mouseX = event.clientX;
    mouseY = event.clientY;


    cursorDot.style.left =
      `${mouseX}px`;

    cursorDot.style.top =
      `${mouseY}px`;


    document.body.classList.add(
      "cursor-visible"
    );

  }
);


/* 큰 렌즈는 살짝 늦게 따라오게 */

function updateCursorLens() {

  lensX +=
    (mouseX - lensX) *
    0.14;

  lensY +=
    (mouseY - lensY) *
    0.14;


  cursorLens.style.left =
    `${lensX}px`;

  cursorLens.style.top =
    `${lensY}px`;


  requestAnimationFrame(
    updateCursorLens
  );
}


updateCursorLens();


/* 화면 밖으로 나갔을 때 */

document.addEventListener(
  "mouseleave",
  () => {

    document.body.classList.remove(
      "cursor-visible"
    );

  }
);


/* 다시 들어왔을 때 */

document.addEventListener(
  "mouseenter",
  () => {

    document.body.classList.add(
      "cursor-visible"
    );

  }
);


/* 클릭 가능한 요소에 올렸을 때 */

const interactiveElements =
  document.querySelectorAll(
    "button, a"
  );


interactiveElements.forEach(
  (element) => {

    element.addEventListener(
      "mouseenter",
      () => {

        document.body.classList.add(
          "cursor-hover"
        );

      }
    );


    element.addEventListener(
      "mouseleave",
      () => {

        document.body.classList.remove(
          "cursor-hover"
        );

      }
    );

  }
);
/* =========================================
   BRAND → FEATURES
========================================= */

const featuresSection =
  document.querySelector("#featuresSection");

const featuresBack =
  document.querySelector("#featuresBack");

let brandWheelAmount = 0;
let brandWheelTimer = null;
let featuresMoving = false;


/*
  BRAND 화면에서 휠을 내리면
  FEATURES 화면으로 이동
*/
brandSection.addEventListener(
  "wheel",
  (event) => {

    /*
      브랜드 화면이 열려있지 않으면 무시
    */
    if (
      !brandSection.classList.contains(
        "is-active"
      )
    ) {
      return;
    }


    /*
      이미 세 번째 화면이 올라와 있으면 무시
    */
    if (
      featuresSection.classList.contains(
        "is-active"
      )
    ) {
      return;
    }


    /*
      아래로 내릴 때만 작동
    */
    if (event.deltaY <= 0) {
      return;
    }


    event.preventDefault();


    /*
      트랙패드 / 휠 입력 누적
    */
    brandWheelAmount +=
      Math.abs(event.deltaY);


    /*
      어느 정도 내리면 화면 전환
    */
    if (
      brandWheelAmount > 90 &&
      !featuresMoving
    ) {

      featuresMoving = true;

      featuresSection.classList.add(
        "is-active"
      );
      brandSection.classList.add(
  "is-behind"
);


      /*
        다음 진입을 위해 초기화
      */
      setTimeout(
        () => {

          brandWheelAmount = 0;
          featuresMoving = false;

        },
        1100
      );

    }


    /*
      손 떼면 누적값 초기화
    */
    clearTimeout(
      brandWheelTimer
    );


    brandWheelTimer =
      setTimeout(
        () => {

          brandWheelAmount = 0;

        },
        400
      );

  },
  {
    passive: false,
  }
);

/* =========================================
   FEATURES → BRAND : UP SCROLL
========================================= */

let featureWheelAmount = 0;
let featureWheelTimer = null;
let lockFeatureBack = false;

featuresSection.addEventListener(
  "wheel",
  (event) => {

    if (
      !featuresSection.classList.contains(
        "is-active"
      )
    ) {
      return;
    }
    if (lockFeatureBack) {
  event.preventDefault();
  return;
}

    /* 위로 스크롤만 감지 */
    if (event.deltaY >= 0) {
      return;
    }

    event.preventDefault();

    featureWheelAmount +=
      Math.abs(event.deltaY);

    /*
      어느 정도 위로 스크롤하면
      이전 화면으로 복귀
    */
if (
  featureWheelAmount > 90
) {

  /*
    is-active는 바로 빼지 않음.
    그래야 타이틀 / 카드 / 버튼이
    갑자기 사라지지 않음.
  */

  featuresSection.classList.add(
    "is-exiting"
  );

  brandSection.classList.remove(
    "is-behind"
  );

  featureWheelAmount = 0;


  /*
    03 화면이 완전히 아래로 내려간 뒤
    그제야 상태 초기화
  */

  setTimeout(
    () => {

      featuresSection.classList.remove(
        "is-active"
      );

      featuresSection.classList.remove(
        "is-exiting"
      );

    },
    1700
  );
}

    clearTimeout(
      featureWheelTimer
    );

    featureWheelTimer =
      setTimeout(
        () => {
          featureWheelAmount = 0;
        },
        400
      );

  },
  {
    passive: false,
  }
);
/* =========================================
   03 → 04 / KIT SECTION
========================================= */

const kitSection =
  document.querySelector(
    "#kitSection"
  );

const kitProducts =
  document.querySelector(
    "#kitProducts"
  );

const kitPackages =
  document.querySelector(
    "#kitPackages"
  );


let kitEnterAmount = 0;
let kitEnterTimer = null;

let kitProgress = 0;


/*
  03 화면에서 아래로 더 스크롤하면
  04 화면 진입
*/
featuresSection.addEventListener(
  "wheel",
  (event) => {

    /*
      03이 활성 상태가 아니면 무시
    */
    if (
      !featuresSection.classList.contains(
        "is-active"
      )
    ) {
      return;
    }


    /*
      이미 04가 열려 있으면
      여기서는 진입 처리 안 함
    */
    if (
      kitSection.classList.contains(
        "is-active"
      )
    ) {
      return;
    }


    /*
      아래 스크롤만
    */
    if (event.deltaY <= 0) {
      return;
    }


    event.preventDefault();

    kitEnterAmount +=
      Math.abs(event.deltaY);


    if (
      kitEnterAmount > 100
    ) {

      kitSection.classList.add(
        "is-active"
      );


      /*
        03은 뒤에서 살짝 멀어지게
      */
      featuresSection.style.transform =
        "scale(0.975) translateY(-1.5%)";


      kitEnterAmount = 0;

    }


    clearTimeout(
      kitEnterTimer
    );


    kitEnterTimer =
      setTimeout(
        () => {

          kitEnterAmount = 0;

        },
        350
      );

  },
  {
    passive: false,
  }
);



/* =========================================
   04 / KIT SCROLL
========================================= */

let kitExitAmount = 0;
let kitExitTimer = null;

let kitExiting = false;


kitSection.addEventListener(
  "wheel",
  (event) => {

    if (
      !kitSection.classList.contains(
        "is-active"
      )
    ) {
      return;
    }


    event.preventDefault();


    /* =====================================
       맨 처음에서 위로 스크롤
       → 03으로 복귀
    ====================================== */

    if (
      event.deltaY < 0 &&
      kitProgress <= 0.015
    ) {

      kitExitAmount +=
        Math.abs(event.deltaY);


      if (
        kitExitAmount > 85 &&
        !kitExiting
      ) {

        kitExiting = true;
lockFeatureBack = true;
featureWheelAmount = 0;

        /*
          04 화면을 통째로 아래로 내림.
          내용은 그대로 유지.
        */

        kitSection.classList.add(
          "is-exiting"
        );


        /*
          뒤의 03 원래 크기로 복귀
        */

        featuresSection.style.transform =
          "";

setTimeout(
  () => {

    kitSection.classList.remove(
      "is-active"
    );

    kitSection.classList.remove(
      "is-exiting"
    );

    kitProgress = 0;
    kitExitAmount = 0;

    updateKitScene();

    kitExiting = false;


    /*
      트랙패드 관성 때문에
      바로 03 → 02가 되는 것 방지
    */
    setTimeout(
      () => {

        lockFeatureBack = false;
        featureWheelAmount = 0;

      },
      900
    );

  },
  1550
);

      }


      clearTimeout(
        kitExitTimer
      );


      kitExitTimer =
        setTimeout(
          () => {

            kitExitAmount = 0;

          },
          350
        );


      return;
    }



    /* =====================================
       04 내부 진행 / 되감기
    ====================================== */

    kitExitAmount = 0;


    /*
      기존보다 약간 더 많은 스크롤이
      필요하게 해서 이동감을 길게 만듦
    */

    const amount =
      event.deltaY * 0.00052;


    kitProgress +=
      amount;


    kitProgress =
      Math.min(
        Math.max(
          kitProgress,
          0
        ),
        1
      );


    updateKitScene();

  },
  {
    passive: false,
  }
);



/* =========================================
   KIT SCENE
========================================= */

function updateKitScene() {

  const green =
    document.querySelector(
      ".product-green"
    );

  const black =
    document.querySelector(
      ".product-black"
    );

  const supplement =
    document.querySelector(
      ".product-supplement"
    );


  /* =====================================
     PRODUCTS

     0 → 0.72 동안 아주 길게 내려감
  ====================================== */

  const productProgress =
    Math.min(
      kitProgress / 0.72,
      1
    );


  /*
    화면 거의 한 개 높이만큼
    실제로 내려감
  */

  const productY =
    productProgress * 82;


  const productScale =
    1 -
    productProgress * 0.32;


  /*
    0.48 전까지는 완전히 보임

    0.48 ~ 0.72 사이에서만
    천천히 사라짐
  */

  let productOpacity = 1;


  if (
    kitProgress > 0.48
  ) {

    productOpacity =
      1 -
      (
        (kitProgress - 0.48)
        / 0.24
      );

  }


  productOpacity =
    Math.max(
      productOpacity,
      0
    );


  kitProducts.style.transform =
    `
      translateX(-50%)
      translateY(${productY}vh)
      scale(${productScale})
    `;


  kitProducts.style.opacity =
    productOpacity;



  /* =====================================
     각 제품이 서로 다르게 회전/이동
  ====================================== */

  green.style.transform =
    `
      translate(
        ${productProgress * 80}px,
        ${productProgress * 35}px
      )
      rotate(
        ${17 + productProgress * 32}deg
      )
    `;


  black.style.transform =
    `
      translate(
        ${productProgress * -65}px,
        ${productProgress * 65}px
      )
      rotate(
        ${-5 - productProgress * 28}deg
      )
    `;


  supplement.style.transform =
    `
      translate(
        ${productProgress * -45}px,
        ${productProgress * 45}px
      )
      rotate(
        ${-13 + productProgress * 20}deg
      )
    `;

  /* =====================================
     PACKAGES

     제품이 거의 사라진 뒤
     0.70부터 등장
  ====================================== */

  const packageProgress =
    Math.min(
      Math.max(
        (kitProgress - 0.70)
        / 0.27,
        0
      ),
      1
    );


  /*
    패키지는 아래쪽에서
    꽤 많이 올라옴
  */

  const packageY =
    38 -
    packageProgress * 38;


  const packageScale =
    0.88 +
    packageProgress * 0.12;


  kitPackages.style.opacity =
    packageProgress;


  kitPackages.style.transform =
    `
      translateX(-50%)
      translateY(${packageY}vh)
      scale(${packageScale})
    `;



  /*
    완전히 나온 뒤 둥실거림
  */

  if (
    packageProgress > 0.97
  ) {

    kitPackages.classList.add(
      "is-floating"
    );

  } else {

    kitPackages.classList.remove(
      "is-floating"
    );

  }

}

