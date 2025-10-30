import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import { Holistic, POSE_LANDMARKS, POSE_CONNECTIONS } from '@mediapipe/holistic';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Camera } from '@mediapipe/camera_utils';
import './BallGame.css';

const BallGame = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [balls, setBalls] = useState([]);
  const [gameActive, setGameActive] = useState(true);
  
  // Ссылки для хранения данных, не требующих перерендера
  const ballsRef = useRef([]);
  const lastBallTimeRef = useRef(0);
  const ballIntervalRef = useRef(1000); // Интервал появления шариков (мс)

  useEffect(() => {
    const holistic = new Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
    });

    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    holistic.onResults(onResults);

    let camera = null;
    if (webcamRef.current?.video) {
      camera = new Camera(webcamRef.current.video, {
        onFrame: async () => {
          if (webcamRef.current?.video) {
            await holistic.send({ image: webcamRef.current.video });
          }
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }

    return () => {
      camera?.stop();
      holistic.close();
    };
  }, []);

  // Игровой цикл для создания шариков
  useEffect(() => {
    if (!gameActive) return;

    const gameLoop = () => {
      const currentTime = Date.now();
      
      // Создаем новый шарик, если прошло достаточно времени
      if (currentTime - lastBallTimeRef.current > ballIntervalRef.current) {
        createNewBall();
        lastBallTimeRef.current = currentTime;
        
        // Постепенно увеличиваем сложность
        if (ballIntervalRef.current > 300) {
          ballIntervalRef.current -= 10;
        }
      }
      
      // Удаляем старые шарики
      const updatedBalls = ballsRef.current.filter(ball => 
        currentTime - ball.createdAt < 3000 // Шарики живут 3 секунды
      );
      
      ballsRef.current = updatedBalls;
      setBalls(updatedBalls);
      
      requestAnimationFrame(gameLoop);
    };

    const animationId = requestAnimationFrame(gameLoop);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gameActive]);

  const createNewBall = () => {
    const newBall = {
      id: Date.now(),
      x: Math.random() * 0.8 + 0.1, // От 0.1 до 0.9 для отступов от краев
      y: Math.random() * 0.6 + 0.2, // От 0.2 до 0.8
      radius: 20 + Math.random() * 20, // От 20 до 40 пикселей
      createdAt: Date.now(),
      caught: false
    };
    
    ballsRef.current = [...ballsRef.current, newBall];
    setBalls(ballsRef.current);
  };

  const onResults = (results) => {
    if (!canvasRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Рисуем видео
    if (results.image) {
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    // Рисуем позу
    if (results.poseLandmarks) {
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { 
        color: 'white', 
        lineWidth: 2 
      });
      drawLandmarks(canvasCtx, results.poseLandmarks, { 
        color: 'white', 
        fillColor: 'rgb(255,138,0)',
        radius: 3
      });
    }

    // Рисуем шарики и проверяем столкновения
    drawBalls(canvasCtx);
    checkCollisions(results.poseLandmarks, canvasCtx);

    canvasCtx.restore();
  };

  const drawBalls = (canvasCtx) => {
    balls.forEach(ball => {
      if (ball.caught) return;
      
      const x = ball.x * canvasRef.current.width;
      const y = ball.y * canvasRef.current.height;
      
      // Рисуем свечение
      const gradient = canvasCtx.createRadialGradient(x, y, 0, x, y, ball.radius);
      gradient.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
      gradient.addColorStop(0.7, 'rgba(255, 255, 100, 0.5)');
      gradient.addColorStop(1, 'rgba(255, 255, 50, 0)');
      
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, ball.radius, 0, 2 * Math.PI);
      canvasCtx.fillStyle = gradient;
      canvasCtx.fill();
      
      // Рисуем контур
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, ball.radius, 0, 2 * Math.PI);
      canvasCtx.strokeStyle = 'rgba(255, 255, 150, 0.8)';
      canvasCtx.lineWidth = 2;
      canvasCtx.stroke();
    });
  };

  const checkCollisions = (poseLandmarks, canvasCtx) => {
    if (!poseLandmarks) return;
    
    const leftWrist = poseLandmarks[POSE_LANDMARKS.LEFT_WRIST];
    const rightWrist = poseLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
    
    if (!leftWrist && !rightWrist) return;
    
    const updatedBalls = [...ballsRef.current];
    let scoreIncrement = 0;
    
    updatedBalls.forEach((ball, index) => {
      if (ball.caught) return;
      
      const ballX = ball.x * canvasRef.current.width;
      const ballY = ball.y * canvasRef.current.height;
      
      // Проверяем столкновение с левым запястьем
      if (leftWrist) {
        const wristX = leftWrist.x * canvasRef.current.width;
        const wristY = leftWrist.y * canvasRef.current.height;
        
        const distance = Math.sqrt(
          Math.pow(wristX - ballX, 2) + Math.pow(wristY - ballY, 2)
        );
        
        if (distance < ball.radius + 15) { // 15 - примерный радиус запястья
          updatedBalls[index].caught = true;
          scoreIncrement += 1;
          
          // Анимация попадания
          drawHitEffect(canvasCtx, ballX, ballY);
        }
      }
      
      // Проверяем столкновение с правым запястьем
      if (rightWrist && !updatedBalls[index].caught) {
        const wristX = rightWrist.x * canvasRef.current.width;
        const wristY = rightWrist.y * canvasRef.current.height;
        
        const distance = Math.sqrt(
          Math.pow(wristX - ballX, 2) + Math.pow(wristY - ballY, 2)
        );
        
        if (distance < ball.radius + 15) {
          updatedBalls[index].caught = true;
          scoreIncrement += 1;
          
          // Анимация попадания
          drawHitEffect(canvasCtx, ballX, ballY);
        }
      }
    });
    
    if (scoreIncrement > 0) {
      setScore(prevScore => prevScore + scoreIncrement);
      ballsRef.current = updatedBalls.filter(ball => !ball.caught);
      setBalls(ballsRef.current);
    }
  };

  const drawHitEffect = (canvasCtx, x, y) => {
    // Рисуем эффект взрыва при попадании
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 10 + Math.random() * 30;
      const particleX = x + Math.cos(angle) * distance;
      const particleY = y + Math.sin(angle) * distance;
      
      canvasCtx.beginPath();
      canvasCtx.arc(particleX, particleY, 3, 0, 2 * Math.PI);
      canvasCtx.fillStyle = `rgba(255, 255, 100, ${0.7 + Math.random() * 0.3})`;
      canvasCtx.fill();
    }
  };

  const resetGame = () => {
    setScore(0);
    ballsRef.current = [];
    setBalls([]);
    lastBallTimeRef.current = Date.now();
    ballIntervalRef.current = 1000;
    setGameActive(true);
  };

  return (
    <div className="ball-game-container">
      <div className="game-header">
        <h1>Ловец световых шариков</h1>
        <div className="score-container">
          <span className="score">Счёт: {score}</span>
          <button className="reset-button" onClick={resetGame}>
            Сбросить счёт
          </button>
        </div>
      </div>
      
      <div className="game-instructions">
        <p>Ловите появляющиеся световые шарики руками!</p>
        <p>Поднесите запястье к шарику, чтобы поймать его.</p>
      </div>
      
      <div className="camera-container">
        <Webcam
          audio={false}
          mirrored
          ref={webcamRef}
          className="webcam"
        />
        <canvas
          ref={canvasRef}
          className="canvas-overlay"
          width={640}
          height={480}
        />
      </div>
    </div>
  );
};

export default BallGame;