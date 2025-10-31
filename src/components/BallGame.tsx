import React, { useRef, useEffect, useState } from 'react';
import { Holistic, POSE_LANDMARKS, POSE_CONNECTIONS } from '@mediapipe/holistic';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Camera } from '@mediapipe/camera_utils';
import './BallGame.css';

interface Ball {
  id: number;
  x: number;
  y: number;
  radius: number;
  createdAt: number;
  caught: boolean;
}

let balls : Ball[] = [];
function setBalls(newBalls : Ball[]) {
  balls = newBalls;
}

const BallGame = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameActive, setGameActive] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  
  const ballsRef = useRef<Ball[]>([]);
  const lastBallTimeRef = useRef(0);
  const ballInterval = 1500;
  const gameLoopRef = useRef<number>(0);

  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadeddata', () => {
            console.log('Камера загружена');
            setCameraReady(true);
            startGameLoop();
          });
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Не удалось получить доступ к камере. Проверьте разрешения.');
      }
    };

    initCamera();

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, []);


  useEffect(() => {
    if (!cameraReady) return;

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

    let camera: Camera | null = null;
    if (videoRef.current) {
      camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) {
            await holistic.send({ image: videoRef.current });
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
  }, [cameraReady]);


  const startGameLoop = () => {
    console.log('Запуск игрового цикла');
    
    const gameLoop = (timestamp: number) => {
      if (!lastBallTimeRef.current || timestamp - lastBallTimeRef.current > ballInterval) {
        createNewBall();
        lastBallTimeRef.current = timestamp;
      }


      const currentTime = Date.now();
      const updatedBalls = ballsRef.current.filter(ball => 
        currentTime - ball.createdAt < 4000
      );

      if (updatedBalls.length !== ballsRef.current.length) {
        ballsRef.current = updatedBalls;
        setBalls([...updatedBalls]);
      }

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const createNewBall = () => {
    const newBall: Ball = {
      id: Date.now() + Math.random(),
      x: Math.random() * 0.6 + 0.2, 
      y: Math.random() * 0.6 + 0.2, 
      radius: 30 + Math.random() * 20, 
      createdAt: Date.now(),
      caught: false
    };
    
    console.log('Создан новый шарик:', newBall);
    
    ballsRef.current = [...ballsRef.current, newBall];
    setBalls([...ballsRef.current]);
  };

  const onResults = (results: any) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('Canvas не найден');
      return;
    }

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) {
      console.log('Canvas context не найден');
      return;
    }


    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.image) {
      canvasCtx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }

    if (results.poseLandmarks) {
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { 
        color: 'white', 
        lineWidth: 2 
      });
      drawLandmarks(canvasCtx, results.poseLandmarks, { 
        color: 'white', 
        fillColor: 'rgb(255,138,0)',
        radius: 4
      });
    }

    drawBalls(canvasCtx);
    
    if (results.poseLandmarks) {
      checkCollisions(results.poseLandmarks, canvasCtx);
    }
  };

  const drawBalls = (canvasCtx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    balls.forEach(ball => {
      const x = ball.x * canvas.width;
      const y = ball.y * canvas.height;
      
      // Рисуем свечение
      const gradient = canvasCtx.createRadialGradient(x, y, 0, x, y, ball.radius);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.3, 'rgba(255, 255, 150, 0.9)'); 
      gradient.addColorStop(0.7, 'rgba(255, 255, 50, 0.5)'); 
      gradient.addColorStop(1, 'rgba(255, 200, 0, 0)'); 
      
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, ball.radius, 0, 2 * Math.PI);
      canvasCtx.fillStyle = gradient;
      canvasCtx.fill();
      

      canvasCtx.beginPath();
      canvasCtx.arc(x, y, ball.radius, 0, 2 * Math.PI);
      canvasCtx.strokeStyle = 'rgba(255, 255, 200, 1)'; 
      canvasCtx.lineWidth = 3;
      canvasCtx.stroke();


      const innerGradient = canvasCtx.createRadialGradient(x, y, 0, x, y, ball.radius * 0.5);
      innerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, ball.radius * 0.5, 0, 2 * Math.PI);
      canvasCtx.fillStyle = innerGradient;
      canvasCtx.fill();
    });
  };

  const checkCollisions = (poseLandmarks: any, canvasCtx: CanvasRenderingContext2D) => {
    const leftWrist = poseLandmarks[POSE_LANDMARKS.LEFT_WRIST];
    const rightWrist = poseLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    let caughtAny = false;
    
 
    let updatedBalls = [...ballsRef.current];
 
    updatedBalls = updatedBalls.map(ball => {
      const ballX = ball.x * canvas.width;
      const ballY = ball.y * canvas.height;
      
      let caught = false;
      
     
      if (leftWrist) {
        const wristX = leftWrist.x * canvas.width;
        const wristY = leftWrist.y * canvas.height;
        
        const distance = Math.sqrt(
          Math.pow(wristX - ballX, 2) + Math.pow(wristY - ballY, 2)
        );
        
        if (distance < ball.radius + 25) {
          caught = true;
        }
      }
      
     
      if (!caught && rightWrist) {
        const wristX = rightWrist.x * canvas.width;
        const wristY = rightWrist.y * canvas.height;
        
        const distance = Math.sqrt(
          Math.pow(wristX - ballX, 2) + Math.pow(wristY - ballY, 2)
        );
        
        if (distance < ball.radius + 25) {
          caught = true;
        }
      }
      
      if (caught) {
        caughtAny = true;
        drawHitEffect(canvasCtx, ballX, ballY);
        
      
        return {
          ...ball,
          caught: true
        };
      }
      
      return ball;
    });
    
    if (caughtAny) {
    
      const remainingBalls = updatedBalls.filter(ball => !ball.caught);
      

      const caughtCount = updatedBalls.length - remainingBalls.length;
      const newBalls = [];
      
      for (let i = 0; i < caughtCount; i++) {
        const newBall: Ball = {
          id: Date.now() + Math.random() + i,
          x: Math.random() * 0.6 + 0.2,
          y: Math.random() * 0.6 + 0.2,
          radius: 30 + Math.random() * 20,
          createdAt: Date.now(),
          caught: false
        };
        newBalls.push(newBall);
      }
      
     
      const finalBalls = [...remainingBalls, ...newBalls];
      
      setScore(prevScore => prevScore + caughtCount);
      ballsRef.current = finalBalls;
      setBalls([...finalBalls]);

 
      
      console.log(`Поймано шаров: ${caughtCount}, создано новых: ${newBalls.length}`);
    }
  };

  const drawHitEffect = (canvasCtx: CanvasRenderingContext2D, x: number, y: number) => {

    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 15 + Math.random() * 30;
      const particleX = x + Math.cos(angle) * distance;
      const particleY = y + Math.sin(angle) * distance;
      const size = 2 + Math.random() * 4;
      
      canvasCtx.beginPath();
      canvasCtx.arc(particleX, particleY, size, 0, 2 * Math.PI);
      canvasCtx.fillStyle = `rgba(255, 255, 100, ${0.8 + Math.random() * 0.2})`;
      canvasCtx.fill();
    }
  };

  const resetGame = () => {
    setScore(0);
    ballsRef.current = [];
    setBalls([]);
    lastBallTimeRef.current = 0;
    
 
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    if (cameraReady) {
      startGameLoop();
    }
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
        {!cameraReady && <p className="loading">Загрузка камеры...</p>}
        {cameraReady && <p className="ready">Камера активна! Начинайте ловить шарики!</p>}
      </div>
      
      <div className="camera-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="webcam-video"
        />
        <canvas
          ref={canvasRef}
          className="canvas-overlay"
          width={640}
          height={480}
        />
      </div>

      <div className="game-stats">
        <p>Активных шариков: {balls.length}</p>
        <p>Размер шариков: 30-50px</p>
        <p>Пойманные шары заменяются новыми!</p>
      </div>
    </div>
  );
};

export default BallGame;