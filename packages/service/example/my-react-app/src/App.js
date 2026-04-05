import React, { useState } from 'react';
import MainMenu from './components/MainMenu';
import GameBoard from './components/GameBoard';

const App = () => {
  const [isGameStarted, setGameStarted] = useState(false);

  const startGame = () => setGameStarted(true);

  return (
    <div>
      {isGameStarted ? <GameBoard /> : <MainMenu onStartGame={startGame} />}
    </div>
  );
};

export default App;