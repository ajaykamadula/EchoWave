import React, { useContext, useState } from 'react';
import withAuth from '../utils/withAuth';
import { useNavigate } from 'react-router-dom';
import "../App.css";
import { Button, IconButton, TextField } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import { AuthContext } from '../contexts/AuthContext';

function HomeComponent() {
  let navigate = useNavigate();
  const [meetingCode, setMeetingCode] = useState("");

  const { addToUserHistory } = useContext(AuthContext);
  let handleJoinVideoCall = async () => {
    await addToUserHistory(meetingCode);
    navigate(`/${meetingCode}`);
  };

  return (
    <>
      <div className="navBar">
        <div className="navBarLeft">
          <h2>EchoWave</h2>
        </div>

        <div className="navBarRight">
          <IconButton
            aria-label="history"
            onClick={() => {
              navigate("/history");
            }}
          >
            <RestoreIcon />
          </IconButton>
          <p className="navText">History</p>

          <Button
            variant="outlined"
            color="secondary"
            onClick={() => {
              localStorage.removeItem("token");
              navigate("/auth");
            }}
          >
            Logout
          </Button>
        </div>
      </div>

      <div className="meetContainer">
        <div className="leftPanel">
          <h2 className="headline">
            Providing Quality Video Call Just Like Quality Education
          </h2>

          <div className="joinInputGroup">
            <TextField
              onChange={(e) => setMeetingCode(e.target.value)}
              id="outlined-basic"
              label="Meeting Code"
              variant="outlined"
              size="small"
            />
            <Button
              onClick={handleJoinVideoCall}
              variant="contained"
              size="medium"
              disabled={!meetingCode.trim()}
            >
              Join
            </Button>
          </div>
        </div>
        <div className="rightPanel">
          <img srcSet="/logo3.png" alt="EchoWave Logo" className="logoImage" />
        </div>
      </div>
    </>
  );
}

export default withAuth(HomeComponent);
