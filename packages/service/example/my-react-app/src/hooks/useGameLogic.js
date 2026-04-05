import { useState, useEffect } from 'react';

const useGameLogic = () => {
  const [snake, setSnake] = useState([[5, 5]]); // Initial snake position
  const [food, setFood] = useState([10, 10]); // Initial food position
  const [direction, setDirection] = useState('RIGHT');

  useEffect(() => {
    const interval = setInterval(() => {
      setSnake((prevSnake) => {
        // Update snake's position here
        return prevSnake;
      });
    }, 200); // Move snake every 200ms

    return () => clearInterval(interval);
  }, []);

  return { snake, food, direction, setDirection };
};

export default useGameLogic;