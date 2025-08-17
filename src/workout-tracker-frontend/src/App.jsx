import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function UsersList(){
    const [users, setUsers] = useState([]);

    useEffect(() =>{
        fetch('http://localhost:5000/users').then(response => response.json()).then(data => setUsers(data)).catch(error => console.error('Error fetching users:', error));
    }, []);

    return (
        <div>
        <h2>Registered Users</h2>
        <ul>
            {users.map(user => (
                <li key={user.id}>{user.username}</li>
            ))}
        </ul>
    </div>
    );

}

function App() {
  const [count, setCount] = useState(0)

  return (
    <div class="title">
      <h1>Workout Log</h1>
    </div>
  );
}

export default App;
