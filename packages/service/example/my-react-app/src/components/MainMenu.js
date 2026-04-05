import React from 'react';

const MainMenu = ({ onStartGame }) => {
  return (
    <div>
      <h1>Main Menu</h1>
      <button onClick={onStartGame}>Start Game</button>
    </div>
  );
};

export default MainMenu;