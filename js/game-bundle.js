/**
 * 무한의 계단 - 단일 스크립트 번들 (file:// 에서도 동작)
 */
(function () {
  'use strict';

  var CANVAS_WIDTH = 800;
  var CANVAS_HEIGHT = 600;
  var STEP_PIXEL = 80;
  var STAIR_BASE_Y = CANVAS_HEIGHT - 100;
  var STAIR_VERTICAL_STEP = 52;
  var STAIR_MIN_X = -5;
  var STAIR_MAX_X = 5;
  var STAIR_RUN_MIN = 1;
  var STAIR_RUN_MAX = 2;
  var JUMP_DURATION_MS = 280;
  var STORAGE_HIGH_SCORE_KEY = 'infinite_stairs_high_score';

  var DIR_LEFT = -1;
  var DIR_RIGHT = 1;

  function randomRunLength() {
    return STAIR_RUN_MIN + Math.floor(Math.random() * (STAIR_RUN_MAX - STAIR_RUN_MIN + 1));
  }

  function generateStairs(count, startX) {
    if (startX === undefined) startX = 0;
    if (count <= 0) return [];
    var stairs = [{ x: startX, floor: 0, moving: false, blinking: false, phase: 0, blinkPhase: 0 }];
    var currentX = startX;
    var direction = DIR_RIGHT;
    var runLeft = randomRunLength();

    for (var floor = 1; floor < count; floor++) {
      var nextX = currentX + direction;
      var clampedX = Math.max(STAIR_MIN_X, Math.min(STAIR_MAX_X, nextX));
      if (clampedX !== nextX) {
        direction = -direction;
        runLeft = randomRunLength();
        currentX = currentX + direction;
      } else {
        currentX = clampedX;
      }
      var step = { x: currentX, floor: floor };
      step.moving = false;
      step.blinking = false;
      step.phase = Math.random() * Math.PI * 2;
      step.blinkPhase = Math.random() * Math.PI * 2;
      if (floor >= 10 && Math.random() < 0.2) {
        step.blinking = true;
      } else if (floor >= 15 && Math.random() < 0.2) {
        step.moving = true;
      }
      stairs.push(step);
      runLeft--;
      if (runLeft <= 0) {
        direction = -direction;
        runLeft = randomRunLength();
      }
    }
    return stairs;
  }

  function getNextStairDirection(stairs, currentIndex) {
    if (currentIndex < 0 || currentIndex >= stairs.length - 1) return null;
    var curr = stairs[currentIndex].x;
    var next = stairs[currentIndex + 1].x;
    var diff = next - curr;
    if (diff < 0) return DIR_LEFT;
    if (diff > 0) return DIR_RIGHT;
    return DIR_RIGHT;
  }

  var PHASE = { READY: 'ready', PLAYING: 'playing', GAMEOVER: 'gameover' };

  function loadHighScore() {
    try {
      var v = localStorage.getItem(STORAGE_HIGH_SCORE_KEY);
      var n = parseInt(v, 10);
      return (typeof n === 'number' && !isNaN(n) && n >= 0) ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function createInitialState(opts) {
    opts = opts || {};
    var stairs = opts.stairs || [];
    var highScore = loadHighScore();
    return {
      phase: PHASE.READY,
      floorIndex: 0,
      characterX: stairs[0] ? stairs[0].x : 0,
      stairs: stairs,
      score: 0,
      highScore: highScore,
      isJumping: false,
      jumpStartTime: 0,
      jumpFrom: null,
      jumpTo: null,
      pendingDirection: null,
      currentDirection: DIR_RIGHT,
      jumpTargetPixelXAtStart: null,
      isFalling: false,
      fallStartTime: 0,
      fallStartX: 0,
      fallStartY: 0,
      fallX: 0,
      fallY: 0
    };
  }

  function saveHighScoreIf(score, currentHigh) {
    if (score <= currentHigh) return currentHigh;
    try {
      localStorage.setItem(STORAGE_HIGH_SCORE_KEY, String(score));
      return score;
    } catch (e) {
      return currentHigh;
    }
  }

  function parabolaY(t) {
    return 4 * t * (1 - t);
  }
  function lerp(start, end, t) {
    return start + (end - start) * t;
  }
  function jumpProgress(elapsedMs) {
    var t = Math.min(1, elapsedMs / JUMP_DURATION_MS);
    return t * t * (3 - 2 * t);
  }

  var CHAR_RADIUS = STEP_PIXEL * 0.4;

  function drawCharacter(ctx, centerX, centerY, direction, timeMs) {
    timeMs = timeMs || 0;
    var bounce = Math.sin(timeMs * 0.0025) * 4;
    var bodySway = Math.sin(timeMs * 0.0012) * 0.02;

    centerY = centerY - bounce;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(bodySway);
    ctx.translate(-centerX, -centerY);
    var r = CHAR_RADIUS;
    var earWiggle = Math.sin(timeMs * 0.0018) * 0.06;
    var blinkPhase = (timeMs % 3200) / 3200;
    var eyesClosed = blinkPhase > 0.92 && blinkPhase < 0.96;

    var off = direction === DIR_RIGHT ? 1 : -1;

    var shadowG = ctx.createRadialGradient(
      centerX, centerY + r * 1.2, 0,
      centerX, centerY + r * 1.2, r * 1.4
    );
    shadowG.addColorStop(0, 'rgba(60,80,40,0.18)');
    shadowG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowG;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + r * 1.1, r * 1.15, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    var bodyY = centerY + r * 0.2;
    var bodyG = ctx.createRadialGradient(
      centerX - r * 0.3, bodyY - r * 0.6, 0,
      centerX, bodyY, r * 1.15
    );
    bodyG.addColorStop(0, '#fff5ed');
    bodyG.addColorStop(0.4, '#f5e6d8');
    bodyG.addColorStop(1, '#dcc4a8');
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.ellipse(centerX, bodyY, r * 0.95, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    var s = state ? state.score : 0;
    if (s >= 40) {
      ctx.fillStyle = '#3d5a80';
      ctx.beginPath();
      ctx.ellipse(centerX, bodyY + r * 0.35, r * 0.82, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2d4a70';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (s >= 30) {
      var shirtG = ctx.createLinearGradient(centerX, bodyY - r * 0.8, centerX, bodyY + r * 0.2);
      shirtG.addColorStop(0, '#e07a5f');
      shirtG.addColorStop(1, '#c56c52');
      ctx.fillStyle = shirtG;
      ctx.beginPath();
      ctx.ellipse(centerX, bodyY - r * 0.25, r * 0.88, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b85d44';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (s >= 50) {
      ctx.fillStyle = '#2d2d2d';
      ctx.beginPath();
      ctx.ellipse(centerX - r * 0.35, bodyY + r * 0.68, r * 0.22, r * 0.12, 0, 0, Math.PI * 2);
      ctx.ellipse(centerX + r * 0.35, bodyY + r * 0.68, r * 0.22, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    var headY = centerY - r * 0.48;
    var headG = ctx.createRadialGradient(
      centerX - r * 0.4, headY - r * 0.4, 0,
      centerX, headY, r * 1.0
    );
    headG.addColorStop(0, '#fffbf5');
    headG.addColorStop(0.35, '#fceee0');
    headG.addColorStop(0.85, '#e8d0b8');
    headG.addColorStop(1, '#d4b898');
    ctx.fillStyle = headG;
    ctx.beginPath();
    ctx.arc(centerX, headY, r * 0.92, 0, Math.PI * 2);
    ctx.fill();

    var earY = centerY - r * 1.02;
    var earW = r * 0.38;
    var earH = r * 0.48;
    var earG = ctx.createRadialGradient(
      centerX - r * 0.2, earY - r * 0.15, 0,
      centerX, earY, r * 0.7
    );
    earG.addColorStop(0, '#f5e8dc');
    earG.addColorStop(0.6, '#e8d0b8');
    earG.addColorStop(1, '#d4b898');
    ctx.fillStyle = earG;
    ctx.beginPath();
    ctx.ellipse(centerX - r * 0.82, earY, earW, earH, 0.12 + earWiggle, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,184,152,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(centerX + r * 0.82, earY, earW, earH, -0.12 - earWiggle, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    var innerEarG = ctx.createRadialGradient(
      centerX - r * 0.82, earY - r * 0.05, 0,
      centerX - r * 0.82, earY, r * 0.2
    );
    innerEarG.addColorStop(0, '#e8c4a8');
    innerEarG.addColorStop(1, '#d4a88a');
    ctx.fillStyle = innerEarG;
    ctx.beginPath();
    ctx.ellipse(centerX - r * 0.82, earY + r * 0.02, earW * 0.5, earH * 0.45, 0.12 + earWiggle, 0, Math.PI * 2);
    ctx.fill();
    var innerEarGR = ctx.createRadialGradient(
      centerX + r * 0.82, earY - r * 0.05, 0,
      centerX + r * 0.82, earY, r * 0.2
    );
    innerEarGR.addColorStop(0, '#e8c4a8');
    innerEarGR.addColorStop(1, '#d4a88a');
    ctx.fillStyle = innerEarGR;
    ctx.beginPath();
    ctx.ellipse(centerX + r * 0.82, earY + r * 0.02, earW * 0.5, earH * 0.45, -0.12 - earWiggle, 0, Math.PI * 2);
    ctx.fill();

    var eyeY = centerY - r * 0.52;
    var eyeSpacing = r * 0.26;
    var eyeR = r * 0.16;
    if (eyesClosed) {
      ctx.strokeStyle = '#2d2d2d';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(centerX - eyeSpacing - eyeR * 0.6, eyeY);
      ctx.quadraticCurveTo(centerX - eyeSpacing, eyeY + eyeR * 0.5, centerX - eyeSpacing + eyeR * 0.6, eyeY);
      ctx.moveTo(centerX + eyeSpacing - eyeR * 0.6, eyeY);
      ctx.quadraticCurveTo(centerX + eyeSpacing, eyeY + eyeR * 0.5, centerX + eyeSpacing + eyeR * 0.6, eyeY);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#2d2d2d';
      ctx.beginPath();
      ctx.arc(centerX - eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
      ctx.arc(centerX + eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(centerX - eyeSpacing + r * 0.06, eyeY - r * 0.05, r * 0.07, 0, Math.PI * 2);
      ctx.arc(centerX + eyeSpacing + r * 0.06, eyeY - r * 0.05, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(centerX - eyeSpacing - r * 0.03, eyeY - r * 0.06, r * 0.03, 0, Math.PI * 2);
      ctx.arc(centerX + eyeSpacing - r * 0.03, eyeY - r * 0.06, r * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state && state.score >= 10) {
      var lensW = r * 0.42;
      var lensH = r * 0.24;
      var lensY = eyeY - lensH * 0.15;
      var lensG = ctx.createLinearGradient(centerX - eyeSpacing, lensY - lensH, centerX - eyeSpacing, lensY + lensH);
      lensG.addColorStop(0, '#1a1a2e');
      lensG.addColorStop(0.5, '#16213e');
      lensG.addColorStop(1, '#0f3460');
      ctx.fillStyle = lensG;
      ctx.strokeStyle = '#2d2d2d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(centerX - eyeSpacing, lensY, lensW, lensH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(centerX + eyeSpacing, lensY, lensW, lensH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(centerX - eyeSpacing - r * 0.08, lensY - r * 0.06, r * 0.08, r * 0.06, -0.3, 0, Math.PI * 2);
      ctx.ellipse(centerX + eyeSpacing - r * 0.08, lensY - r * 0.06, r * 0.08, r * 0.06, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX - eyeSpacing + lensW * 0.5, lensY);
      ctx.lineTo(centerX + eyeSpacing - lensW * 0.5, lensY);
      ctx.stroke();
    }

    var cheekG = ctx.createRadialGradient(
      centerX - r * 0.5, centerY - r * 0.25, 0,
      centerX - r * 0.5, centerY - r * 0.25, r * 0.35
    );
    cheekG.addColorStop(0, 'rgba(255, 180, 160, 0.65)');
    cheekG.addColorStop(1, 'rgba(255, 200, 180, 0)');
    ctx.fillStyle = cheekG;
    ctx.beginPath();
    ctx.ellipse(centerX - r * 0.52, centerY - r * 0.26, r * 0.24, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cheekG;
    ctx.beginPath();
    ctx.ellipse(centerX + r * 0.52, centerY - r * 0.26, r * 0.24, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#b8956a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY - r * 0.22, r * 0.38, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();

    var noseG = ctx.createRadialGradient(
      centerX - 2, centerY - r * 0.36, 0,
      centerX, centerY - r * 0.36, r * 0.12
    );
    noseG.addColorStop(0, '#c9a060');
    noseG.addColorStop(1, '#8b6914');
    ctx.fillStyle = noseG;
    ctx.beginPath();
    ctx.arc(centerX, centerY - r * 0.36, r * 0.11, 0, Math.PI * 2);
    ctx.fill();

    if (s >= 20) {
      var flowerColors = ['#ffb7c5', '#ff9ebb', '#ff85a2'];
      var flowerCenters = [
        { x: centerX, y: headY - r * 0.82, scale: 1.4 },
        { x: centerX - r * 0.5, y: headY - r * 0.65, scale: 0.85 },
        { x: centerX + r * 0.48, y: headY - r * 0.68, scale: 0.9 }
      ];
      for (var f = 0; f < flowerCenters.length; f++) {
        var fc = flowerCenters[f];
        var petalR = r * 0.2 * fc.scale;
        var centerR = r * 0.12 * fc.scale;
        ctx.fillStyle = flowerColors[f % flowerColors.length];
        for (var p = 0; p < 5; p++) {
          var a = (p / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.save();
          ctx.translate(fc.x + Math.cos(a) * r * 0.28 * fc.scale, fc.y + Math.sin(a) * r * 0.28 * fc.scale);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.ellipse(0, 0, petalR, petalR * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(fc.x, fc.y, centerR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (s >= 60) {
      var bagX = centerX + off * (r * 0.92);
      var bagY = bodyY;
      var bw = r * 0.4;
      var bh = r * 0.5;
      var br = 4;
      ctx.fillStyle = '#5c4033';
      ctx.beginPath();
      ctx.moveTo(bagX - bw / 2 + br, bagY - bh / 2);
      ctx.lineTo(bagX + bw / 2 - br, bagY - bh / 2);
      ctx.quadraticCurveTo(bagX + bw / 2, bagY - bh / 2, bagX + bw / 2, bagY - bh / 2 + br);
      ctx.lineTo(bagX + bw / 2, bagY + bh / 2 - br);
      ctx.quadraticCurveTo(bagX + bw / 2, bagY + bh / 2, bagX + bw / 2 - br, bagY + bh / 2);
      ctx.lineTo(bagX - bw / 2 + br, bagY + bh / 2);
      ctx.quadraticCurveTo(bagX - bw / 2, bagY + bh / 2, bagX - bw / 2, bagY + bh / 2 - br);
      ctx.lineTo(bagX - bw / 2, bagY - bh / 2 + br);
      ctx.quadraticCurveTo(bagX - bw / 2, bagY - bh / 2, bagX - bw / 2 + br, bagY - bh / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4e342e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#6d4c41';
      ctx.beginPath();
      ctx.ellipse(bagX, bagY - bh / 2 - r * 0.02, r * 0.15, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (s >= 70) {
      var hatY = headY - r * 0.92;
      var capG = ctx.createLinearGradient(centerX, hatY - r * 0.3, centerX, hatY + r * 0.2);
      capG.addColorStop(0, '#c41e3a');
      capG.addColorStop(1, '#8b0000');
      ctx.fillStyle = capG;
      ctx.beginPath();
      ctx.ellipse(centerX, hatY, r * 0.55, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(centerX, hatY - r * 0.08, r * 0.5, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawBackground(ctx) {
    var h = CANVAS_HEIGHT;
    var w = CANVAS_WIDTH;
    var sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, '#87ceeb');
    sky.addColorStop(0.5, '#98d8c8');
    sky.addColorStop(1, '#7cb87c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(45, 87, 44, 0.35)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.4);
    ctx.quadraticCurveTo(w * 0.2, h * 0.25, w * 0.4, h * 0.45);
    ctx.quadraticCurveTo(w * 0.6, h * 0.3, w * 0.8, h * 0.5);
    ctx.quadraticCurveTo(w * 1.05, h * 0.35, w, h * 0.55);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(34, 68, 34, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.55);
    ctx.quadraticCurveTo(w * 0.25, h * 0.38, w * 0.5, h * 0.6);
    ctx.quadraticCurveTo(w * 0.75, h * 0.42, w, h * 0.65);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    var ground = ctx.createLinearGradient(0, h * 0.5, 0, h);
    ground.addColorStop(0, 'rgba(124, 184, 124, 0.5)');
    ground.addColorStop(0.6, 'rgba(94, 160, 94, 0.7)');
    ground.addColorStop(1, 'rgba(56, 120, 56, 0.85)');
    ctx.fillStyle = ground;
    ctx.fillRect(0, h * 0.45, w, h);
    var sun = ctx.createRadialGradient(w * 0.7, 80, 0, w * 0.7, 80, 220);
    sun.addColorStop(0, 'rgba(255, 255, 220, 0.25)');
    sun.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h * 0.5);
  }

  function drawSingleStair(ctx, pixelX, pixelY, width, height) {
    var depth = 14;
    var topH = 18;
    var frontH = height - topH;
    var left = pixelX;
    var top = pixelY;
    var right = pixelX + width;
    var bottom = pixelY + height;
    var skew = depth * 0.5;
    var cx = left + width / 2;
    var midY = top + topH - skew * 0.5;

    ctx.save();

    // 1) 옆면 - 통나무 껍질 (갈색, 굴곡 라인)
    var barkG = ctx.createLinearGradient(left, top, left + depth, top);
    barkG.addColorStop(0, '#5d4e37');
    barkG.addColorStop(0.3, '#6f5a3d');
    barkG.addColorStop(0.6, '#8b7355');
    barkG.addColorStop(1, '#6b5640');
    ctx.fillStyle = barkG;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left + depth, bottom - skew);
    ctx.lineTo(left + depth, top + topH - skew);
    ctx.lineTo(left, top + topH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4a3d2a';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (var b = 0; b < 4; b++) {
      var by = top + topH + (frontH - skew) * (0.2 + b * 0.25) + (b % 2) * 2;
      ctx.strokeStyle = 'rgba(45,35,22,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left + 3, by);
      ctx.lineTo(left + depth - 3, by - skew * 0.6);
      ctx.stroke();
    }

    // 2) 정면 - 잘린 단면 (나이테 원형)
    var faceLeft = left + depth;
    var faceTop = top + topH;
    var faceW = width - depth;
    var faceH = frontH - skew;
    var ringCx = faceLeft + faceW / 2;
    var ringCy = faceTop + faceH / 2;
    var ringRx = faceW / 2 - 2;
    var ringRy = faceH / 2 - 2;
    var woodG = ctx.createRadialGradient(ringCx - 5, ringCy - 5, 0, ringCx, ringCy, Math.max(ringRx, ringRy));
    woodG.addColorStop(0, '#d4a574');
    woodG.addColorStop(0.4, '#c4956a');
    woodG.addColorStop(0.8, '#a67c52');
    woodG.addColorStop(1, '#8b6914');
    ctx.fillStyle = woodG;
    ctx.beginPath();
    ctx.ellipse(ringCx, ringCy, ringRx, ringRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (var r = 1; r <= 5; r++) {
      var t = r / 6;
      ctx.strokeStyle = 'rgba(139,105,20,' + (0.4 + t * 0.4) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ringCx, ringCy, ringRx * t, ringRy * t, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3) 윗면 - 통나무 둥근 상판 (껍질 느낌)
    var topG = ctx.createLinearGradient(left, top + topH * 0.5, right, top + topH);
    topG.addColorStop(0, '#8b7355');
    topG.addColorStop(0.2, '#a08060');
    topG.addColorStop(0.5, '#b8956a');
    topG.addColorStop(0.8, '#9a7b52');
    topG.addColorStop(1, '#6f5a3d');
    ctx.fillStyle = topG;
    ctx.beginPath();
    ctx.moveTo(left, top + topH);
    ctx.lineTo(left + depth, top + topH - skew);
    ctx.lineTo(right, top + topH - skew);
    ctx.lineTo(right - depth, top + topH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5d4e37';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,55,35,0.4)';
    ctx.lineWidth = 1;
    for (var l = 0; l < 3; l++) {
      var lx = left + depth + (width - depth * 2) * (0.25 + l * 0.3);
      ctx.beginPath();
      ctx.moveTo(lx, top + topH - 1);
      ctx.lineTo(lx + depth * 0.4, top + topH - skew - 1);
      ctx.stroke();
    }
    var topHighlight = ctx.createLinearGradient(left, top + topH, left + width * 0.6, top + topH - skew);
    topHighlight.addColorStop(0, 'rgba(220,200,160,0.25)');
    topHighlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = topHighlight;
    ctx.beginPath();
    ctx.moveTo(left, top + topH);
    ctx.lineTo(left + depth, top + topH - skew);
    ctx.lineTo(left + width * 0.5, top + topH - skew * 0.5);
    ctx.lineTo(left + width * 0.15, top + topH);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  var FLOOR_HORIZ = 0.48;
  var X_ZIGZAG = 1.25;
  var STAIR_TOP_H = 18;
  var CENTER_OFFSET_FLOORS = 5;
  var MOVE_AMPLITUDE_PX = 48;
  var MOVE_PERIOD_MS = 1000;
  var MOVE_MISS_THRESHOLD_PX = 38;
  var BLINK_PERIOD_MS = 2200;
  var FALL_GRAVITY_PX = 0.5;
  var FALL_TERMINATE_Y = CANVAS_HEIGHT + 120;

  function getStairMoveOffset(stair, timeMs) {
    if (!stair || !stair.moving) return 0;
    return MOVE_AMPLITUDE_PX * Math.sin(2 * Math.PI * timeMs / MOVE_PERIOD_MS + (stair.phase || 0));
  }

  function getStairVisibility(stair, timeMs) {
    if (!stair || !stair.blinking) return 1;
    var t = 2 * Math.PI * timeMs / BLINK_PERIOD_MS + (stair.blinkPhase || 0);
    return (Math.sin(t) + 1) * 0.5;
  }

  function isStairVisible(stair, timeMs) {
    return getStairVisibility(stair, timeMs) >= 0.5;
  }

  function drawStairs(ctx, stairs, currentFloorIndex) {
    if (!stairs.length) return;
    var stepPx = STEP_PIXEL;
    var originX = CANVAS_WIDTH / 2;
    var refX = stairs[currentFloorIndex].x;
    var refFloor = currentFloorIndex;
    var t = performance.now();
    var startFloor = Math.max(0, currentFloorIndex - 2);
    var endFloor = Math.min(stairs.length, currentFloorIndex + 12);
    for (var i = startFloor; i < endFloor; i++) {
      var s = stairs[i];
      var alpha = 1;
      if (s.blinking) {
        alpha = getStairVisibility(s, t);
        if (alpha <= 0.01) continue;
      }
      ctx.save();
      if (s.blinking) ctx.globalAlpha = alpha;
      var pixelX = originX + (s.floor - refFloor - CENTER_OFFSET_FLOORS) * stepPx * FLOOR_HORIZ + (s.x - refX) * stepPx * X_ZIGZAG - stepPx / 2;
      pixelX += getStairMoveOffset(s, t);
      var pixelY = STAIR_BASE_Y - (s.floor - refFloor) * STAIR_VERTICAL_STEP;
      drawSingleStair(ctx, pixelX, pixelY, stepPx, stepPx * 0.5);
      ctx.restore();
    }
  }

  function stairToPixel(gridX, floorIndex, refFloor, refX, stairs, timeMs) {
    var originX = CANVAS_WIDTH / 2;
    var stepPx = STEP_PIXEL;
    var x = originX + (floorIndex - refFloor - CENTER_OFFSET_FLOORS) * stepPx * FLOOR_HORIZ + (gridX - refX) * stepPx * X_ZIGZAG;
    if (stairs && timeMs != null && stairs[floorIndex]) {
      x += getStairMoveOffset(stairs[floorIndex], timeMs);
    }
    var pixelY = STAIR_BASE_Y - (floorIndex - refFloor) * STAIR_VERTICAL_STEP;
    var stairTopY = pixelY + STAIR_TOP_H;
    var y = stairTopY - CHAR_RADIUS;
    return { x: x, y: y };
  }

  var JUMP_AMPLITUDE = STEP_PIXEL * 1.0;

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var gameMain = document.getElementById('game-main');
  var scoreEl = document.getElementById('score');
  var highScoreEl = document.getElementById('high-score');
  var gameoverOverlay = document.getElementById('gameover-overlay');
  var gameoverScoreEl = document.getElementById('gameover-score');
  var btnRestart = document.getElementById('btn-restart');

  var state = null;
  var STAIRS_COUNT = 600;
  var fireworkParticles = [];

  function spawnFireworks(centerX, centerY) {
    var colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#ff9f43', '#00d9ff', '#ff4081'];
    var burstCount = 3;
    var offsetX = [-60, 0, 55];
    var offsetY = [-40, -80, -35];
    for (var b = 0; b < burstCount; b++) {
      var bx = centerX + offsetX[b];
      var by = centerY + offsetY[b];
      var particleCount = 56;
      for (var i = 0; i < particleCount; i++) {
        var angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.8;
        var speed = 5 + Math.random() * 9;
        fireworkParticles.push({
          x: bx,
          y: by,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          life: 1,
          maxLife: 1,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 5 + Math.random() * 7
        });
      }
    }
  }

  function updateFireworks(dt) {
    for (var i = fireworkParticles.length - 1; i >= 0; i--) {
      var p = fireworkParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.life -= dt / 1200;
      if (p.life <= 0) fireworkParticles.splice(i, 1);
    }
  }

  function drawFireworks(ctx) {
    for (var i = 0; i < fireworkParticles.length; i++) {
      var p = fireworkParticles[i];
      var alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color.replace(')', ', ' + alpha + ')').replace('rgb', 'rgba').replace('#', '');
      var hex = p.color;
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function init() {
    var stairs = generateStairs(STAIRS_COUNT);
    state = createInitialState({ stairs: stairs });
    fireworkParticles = [];
    if (gameoverOverlay) gameoverOverlay.classList.add('hidden');
    updateUI();
  }

  function focusGame() {
    if (gameMain && gameMain.focus) gameMain.focus();
  }

  function updateUI() {
    if (!state) return;
    if (scoreEl) scoreEl.textContent = state.score;
    if (highScoreEl) highScoreEl.textContent = state.highScore;
  }

  function onKeyDown(e) {
    var key = e.key;
    var isGameKey = key === ' ' || key === 'ArrowLeft' || key === 'ArrowRight';
    if (isGameKey) {
      e.preventDefault();
      if (gameMain && gameMain.focus) gameMain.focus();
    }
    if (!state || state.phase === PHASE.GAMEOVER || state.isFalling) return;
    if (e.repeat) return;
    if (key === 'ArrowLeft') {
      state.pendingDirection = DIR_LEFT;
    } else if (key === 'ArrowRight') {
      state.pendingDirection = DIR_RIGHT;
    } else if (key === ' ') {
      tryJump();
    }
  }

  function tryJump() {
    if (state.phase === PHASE.READY) state.phase = PHASE.PLAYING;
    if (state.phase !== PHASE.PLAYING) return;
    if (state.isJumping) return;

    var nextDir = getNextStairDirection(state.stairs, state.floorIndex);
    if (nextDir === null) return;

    if (nextDir === state.currentDirection) {
      // 같은 방향: 스페이스바만으로 점프 허용
    } else {
      // 방향이 바뀜: 반드시 방향키(←/→)로 방향 선택 후 스페이스바. 아니면 탈락
      if (state.pendingDirection !== nextDir) {
        state.phase = PHASE.GAMEOVER;
        state.highScore = saveHighScoreIf(state.score, state.highScore);
        showGameOver();
        return;
      }
    }

    var nextStair = state.stairs[state.floorIndex + 1];
    state.jumpStartTime = performance.now();
    var refFloor = state.floorIndex;
    var refX = state.characterX;
    state.jumpTargetPixelXAtStart = stairToPixel(nextStair.x, nextStair.floor, refFloor, refX, state.stairs, state.jumpStartTime).x;
    state.isJumping = true;
    state.jumpFrom = { x: state.characterX, floor: state.floorIndex };
    state.jumpTo = { x: nextStair.x, floor: nextStair.floor };
    state.pendingDirection = null;
  }

  function showGameOver() {
    if (gameoverScoreEl) gameoverScoreEl.textContent = state.score;
    if (gameoverOverlay) gameoverOverlay.classList.remove('hidden');
    updateUI();
  }

  function startFall(fromX, fromY) {
    var pos;
    if (fromX != null && fromY != null) {
      pos = { x: fromX, y: fromY };
    } else {
      pos = getCharacterDisplayPos();
    }
    state.isFalling = true;
    state.fallStartTime = performance.now();
    state.fallStartX = pos.x;
    state.fallStartY = pos.y;
    state.fallX = pos.x;
    state.fallY = pos.y;
    state.isJumping = false;
    state.jumpFrom = null;
    state.jumpTo = null;
    state.jumpTargetPixelXAtStart = null;
  }

  function restart() {
    if (gameoverOverlay) gameoverOverlay.classList.add('hidden');
    init();
    setTimeout(focusGame, 50);
  }

  function completeJump() {
    var nextStair = state.stairs[state.jumpTo.floor];
    if (nextStair && nextStair.moving && state.jumpTargetPixelXAtStart != null) {
      var refFloor = state.floorIndex;
      var refX = state.characterX;
      var now = performance.now();
      var currentTargetX = stairToPixel(state.jumpTo.x, state.jumpTo.floor, refFloor, refX, state.stairs, now).x;
      var movedDistance = Math.abs(currentTargetX - state.jumpTargetPixelXAtStart);
      if (movedDistance > MOVE_MISS_THRESHOLD_PX) {
        state.highScore = saveHighScoreIf(state.score, state.highScore);
        var toPx = stairToPixel(state.jumpTo.x, state.jumpTo.floor, refFloor, refX, state.stairs, now);
        startFall(toPx.x, toPx.y);
        return;
      }
    }
    if (nextStair && nextStair.blinking && !isStairVisible(nextStair, performance.now())) {
      state.highScore = saveHighScoreIf(state.score, state.highScore);
      var refFloor = state.floorIndex;
      var refX = state.characterX;
      var toPx = stairToPixel(state.jumpTo.x, state.jumpTo.floor, refFloor, refX, state.stairs, performance.now());
      startFall(toPx.x, toPx.y);
      return;
    }
    state.characterX = state.jumpTo.x;
    state.floorIndex = state.jumpTo.floor;
    state.score = state.floorIndex;
    if (state.score > 0 && state.score % 10 === 0) {
      spawnFireworks(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);
    }
    state.currentDirection = state.jumpTo.x > state.jumpFrom.x ? DIR_RIGHT : DIR_LEFT;
    state.isJumping = false;
    state.jumpFrom = null;
    state.jumpTo = null;
    state.jumpTargetPixelXAtStart = null;
    if (state.score > state.highScore) state.highScore = state.score;
    if (gameMain && gameMain.focus) gameMain.focus();
  }

  function update(now) {
    updateFireworks(16);
    if (!state || state.phase === PHASE.GAMEOVER) return;

    if (state.isFalling) {
      var fallElapsed = (now - state.fallStartTime) / 1000;
      state.fallY = state.fallStartY + 0.5 * FALL_GRAVITY_PX * 800 * fallElapsed * fallElapsed;
      state.fallX = state.fallStartX;
      if (state.fallY >= FALL_TERMINATE_Y) {
        state.isFalling = false;
        state.phase = PHASE.GAMEOVER;
        showGameOver();
      }
      updateUI();
      return;
    }

    if (state.isJumping && state.jumpFrom && state.jumpTo) {
      var elapsed = now - state.jumpStartTime;
      var progress = jumpProgress(elapsed);
      if (progress >= 1 || elapsed > JUMP_DURATION_MS * 2) {
        completeJump();
      }
    } else if (!state.isJumping && state.stairs[state.floorIndex]) {
      var curStair = state.stairs[state.floorIndex];
      if (curStair.blinking && !isStairVisible(curStair, now)) {
        state.highScore = saveHighScoreIf(state.score, state.highScore);
        startFall();
      }
    }

    updateUI();
  }

  function getCharacterDisplayPos() {
    var refFloor = state.floorIndex;
    var refX = state.characterX;
    var t = performance.now();
    var from = stairToPixel(state.characterX, state.floorIndex, refFloor, refX, state.stairs, t);
    var x = from.x;
    var y = from.y;
    var direction = DIR_RIGHT;

    if (state.isJumping && state.jumpFrom && state.jumpTo) {
      var elapsed = t - state.jumpStartTime;
      var progress = jumpProgress(elapsed);
      var fromPx = stairToPixel(state.jumpFrom.x, state.jumpFrom.floor, refFloor, refX, state.stairs, state.jumpStartTime);
      var toPx = stairToPixel(state.jumpTo.x, state.jumpTo.floor, refFloor, refX, state.stairs, t);
      x = lerp(fromPx.x, toPx.x, progress);
      y = lerp(fromPx.y, toPx.y, progress) - parabolaY(progress) * JUMP_AMPLITUDE;
      direction = state.jumpTo.x > state.jumpFrom.x ? DIR_RIGHT : DIR_LEFT;
    } else if (state.stairs[state.floorIndex + 1]) {
      var next = state.stairs[state.floorIndex + 1];
      direction = next.x > state.characterX ? DIR_RIGHT : DIR_LEFT;
    }
    return { x: x, y: y, direction: direction };
  }

  function draw() {
    if (!state || !ctx) return;
    drawBackground(ctx);
    drawFireworks(ctx);
    drawStairs(ctx, state.stairs, state.floorIndex);
    if (state.phase !== PHASE.GAMEOVER) {
      var pos;
      if (state.isFalling) {
        pos = { x: state.fallX, y: state.fallY, direction: state.currentDirection || DIR_RIGHT };
      } else {
        pos = getCharacterDisplayPos();
      }
      drawCharacter(ctx, pos.x, pos.y, pos.direction, performance.now());
    }
    update(performance.now());
  }

  function gameLoop() {
    draw();
    requestAnimationFrame(gameLoop);
  }

  if (canvas) {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
  }

  window.addEventListener('keydown', onKeyDown, true);
  if (gameMain) {
    gameMain.addEventListener('click', focusGame);
    gameMain.addEventListener('focusin', focusGame);
    gameMain.addEventListener('mousedown', focusGame);
  }
  if (canvas) canvas.addEventListener('click', focusGame);
  if (btnRestart) btnRestart.addEventListener('click', restart);

  init();
  focusGame();
  requestAnimationFrame(gameLoop);
})();
