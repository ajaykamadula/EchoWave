import React, { useEffect, useRef, useState } from "react";
import TextField from "@mui/material/TextField";
import { Badge, Button, IconButton } from "@mui/material";
import { io } from "socket.io-client";
import styles from "../styles/VideoComponent.module.css";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import { useNavigate } from "react-router-dom";

import ChatIcon from "@mui/icons-material/Chat";

const server_url = "http://localhost:8000";

const connections = {};
const iceBuffers = {}; // maps socketId → [candidate1, candidate2, …]

const peerConfigConnection = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
export default function VideoMeetComponent() {
  var socketRef = useRef();

  let socketIdRef = useRef();
  let localVideoRef = useRef();
  let [videoAvailable, setVideoAvailable] = useState(true);
  let [audioAvailable, setAudioAvailable] = useState(true);
  let [video, setVideo] = useState([]);
  let [audio, setAudio] = useState();
  let [screen, setScreen] = useState();
  let [showModal, setModal] = useState(true);
  let [screenAvailable, setScreenAvailable] = useState();
  let [messages, setMessages] = useState([]);
  let [message, setMessage] = useState("");
  let [newMessages, setNewMessages] = useState(3);
  let [askForUsername, setAskForUsername] = useState(true);
  let [username, setUsername] = useState("");
  const videoRef = useRef([]);
  let [videos, setVideos] = useState([]);

  //TODO
  // if(isChrome() === false){

  // }

  const getPermissions = async () => {
    try {
      const videoPermission = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      if (videoPermission) {
        setVideoAvailable(true);
      } else {
        setVideoAvailable(false);
      }

      const audioPermission = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (audioPermission) {
        setAudioAvailable(true);
      } else {
        setAudioAvailable(false);
      }

      if (navigator.mediaDevices.getDisplayMedia) {
        setScreenAvailable(true);
      } else {
        setScreenAvailable(false);
      }

      if (videoAvailable || audioAvailable) {
        const userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoAvailable,
          audio: audioAvailable,
        });

        if (userMediaStream) {
          window.localStream = userMediaStream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = userMediaStream;
          }
        }
      }
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    getPermissions();
  }, []);

  let getUserMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }
    window.localStream = stream;
    localVideoRef.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;
      connections[id].addStream(window.localStream);
      connections[id].createOffer().then((description) => {
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            if (socketRef.current) {
              socketRef.current.emit(
                "signal",
                id,
                JSON.stringify({ sdp: connections[id].localDescription })
              );
            }
          })
          .catch((e) => console.log(e));
      });
    }
    stream.getTracks().forEach(
      (track) =>
        (track.onended = () => {
          setVideo(false);
          setAudio(false);
          try {
            let tracks = localVideoRef.current.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
          } catch (e) {
            console.log(e);
          }

          //TODO BlackSilence
          let blackSilence = (...args) =>
            new MediaStream([black(...args), silence()]);
          window.localStream = blackSilence();
          localVideoRef.current.srcObject = window.localStream;

          for (let id in connections) {
            connections[id].addStream(window.localStream);
            connections[id].createOffer().then((description) => {
              connections[id]
                .setLocalDescription(description)
                .then(() => {
                  socketRef.current.emit(
                    "signal",
                    id,
                    JSON.stringify({ sdp: connections[id].localDescription })
                  );
                })
                .catch((e) => console.log(e));
            });
          }
        })
    );
  };

  let silence = () => {
    let ctx = new AudioContext();
    let oscillator = new ctx.createOscillator();

    let dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };
  let black = ({ width = 640, height = 480 } = {}) => {
    let canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    canvas.getContext("2d").fillRect(0, 0, width, height);
    let stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };

  let getUserMedia = () => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices
        .getUserMedia({ video: video, audio: audio })
        .then(getUserMediaSuccess) //TODO : getUserMediaSuccess
        .then((stream) => {})
        .catch((e) => console.log(e));
    } else {
      try {
        let tracks = localVideoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (video !== undefined && audio !== undefined) {
      getUserMedia();
    }
  }, [audio, video]);

  const gotMessageFromServer = async (fromId, message) => {
    const signal = JSON.parse(message);
    if (fromId === socketIdRef.current) return;

    // Ensure connection exists
    if (!connections[fromId]) {
      connections[fromId] = new RTCPeerConnection(peerConfigConnection);

      connections[fromId].onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit(
            "signal",
            fromId,
            JSON.stringify({ ice: event.candidate })
          );
        }
      };

      connections[fromId].onaddstream = (event) => {
        setVideos((prev) => {
          const exists = prev.find((v) => v.socketId === fromId);
          if (!exists) {
            return [...prev, { socketId: fromId, stream: event.stream }];
          }
          return prev;
        });
      };

      if (window.localStream) {
        // ALWAYS in the same order: video first, then audio
        const pc = new RTCPeerConnection(peerConfigConnection);
        window.localStream
          .getVideoTracks()
          .forEach((track) => pc.addTrack(track, window.localStream));
        window.localStream
          .getAudioTracks()
          .forEach((track) => pc.addTrack(track, window.localStream));
        connections[fromId] = pc;
      }
    }

    const peer = connections[fromId];

    if (signal.sdp) {
      peer
        .setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(() => {
          if (signal.sdp.type === "offer") {
            peer.createAnswer().then((description) => {
              peer.setLocalDescription(description).then(() => {
                socketRef.current?.emit(
                  "signal",
                  fromId,
                  JSON.stringify({ sdp: description })
                );
              });
            });
          }
        });
    }

    if (signal.ice) {
      // If remoteDescription is already set, add immediately…
      if (peer.remoteDescription && peer.remoteDescription.type) {
        peer
          .addIceCandidate(new RTCIceCandidate(signal.ice))
          .catch(console.error);
      }
      // Otherwise, buffer for later:
      else {
        iceBuffers[fromId] = iceBuffers[fromId] || [];
        iceBuffers[fromId].push(signal.ice);
      }
    }
  };

  const addMessage = (data, sender, socketIdSender) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { sender: sender, data: data },
    ]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages((prevNewMessages) => prevNewMessages + 1);
    }
  };

  let connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });
    socketRef.current.on("signal", gotMessageFromServer);
    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;
      socketRef.current.on("chat-message", addMessage);
      socketRef.current.on("user-left", (id) => {
        setVideos((videos) => videos.filter((video) => video.socketId !== id));
      });

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach((socketListId) => {
          // 1) Create peer only if it doesn’t already exist
          if (!connections[socketListId]) {
            const peer = new RTCPeerConnection(peerConfigConnection);
            connections[socketListId] = peer;

            // 2) ICE candidate handling
            peer.onicecandidate = (event) => {
              if (event.candidate && socketRef.current) {
                socketRef.current.emit(
                  "signal",
                  socketListId,
                  JSON.stringify({ ice: event.candidate })
                );
              }
            };

            // 3) onaddstream with deduplication
            peer.onaddstream = (event) => {
              // check if this socketId is already in our list
              const exists = videoRef.current.some(
                (v) => v.socketId === socketListId
              );
              if (exists) {
                // update the existing entry’s stream
                setVideos((prev) =>
                  prev.map((v) =>
                    v.socketId === socketListId
                      ? { ...v, stream: event.stream }
                      : v
                  )
                );
              } else {
                // add a new entry
                const newVideo = {
                  socketId: socketListId,
                  stream: event.stream,
                };
                setVideos((prev) => {
                  const updated = [...prev, newVideo];
                  videoRef.current = updated; // sync ref
                  return updated;
                });
              }
            };

            // 4) attach our local stream if available
            if (window.localStream) {
              peer.addStream(window.localStream);
            }
          }
        });

        // 5) If we just joined, send an offer to each existing peer
        if (id === socketIdRef.current) {
          Object.keys(connections).forEach((otherId) => {
            if (otherId === id) return;
            const peer = connections[otherId];
            peer.createOffer().then((offer) =>
              peer.setLocalDescription(offer).then(() => {
                socketRef.current.emit(
                  "signal",
                  otherId,
                  JSON.stringify({ sdp: peer.localDescription })
                );
              })
            );
          });
        }
      });

      // socketRef.current.on("user-joined", (id, clients) => {
      //   clients.forEach((socketListId) => {
      //     connections[socketListId] = new RTCPeerConnection(
      //       peerConfigConnection
      //     );
      //   });
      // });
    });
  };
  let getMedia = () => {
    setVideo(videoAvailable);
    setAudio(audioAvailable);
    connectToSocketServer();
  };
  let routeTo = useNavigate();
  let connect = () => {
    setAskForUsername(false);
    getMedia();
  };
  let handleVideo = () => {
    setVideo(!video);
  };
  let handleAudio = () => {
    setAudio(!audio);
  };

  let getDisplayMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }
    window.localStream = stream;
    localVideoRef.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      connections[id].addStream(window.localStream);
      connections[id].createOffer().then((description) => {
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            if (socketRef.current) {
              socketRef.current.emit(
                "signal",
                id,
                JSON.stringify({ sdp: connections[id].localDescription })
              );
            }
          })
          .catch((e) => console.log(e));
      });
    }
    stream.getTracks().forEach(
      (track) =>
        (track.onended = () => {
          setScreen(false);
          try {
            let tracks = localVideoRef.current.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
          } catch (e) {
            console.log(e);
          }

          //TODO BlackSilence
          let blackSilence = (...args) =>
            new MediaStream([black(...args), silence()]);
          window.localStream = blackSilence();
          localVideoRef.current.srcObject = window.localStream;

          getUserMedia();
        })
    );
  };
  let getDisplayMedia = () => {
    if (screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices
          .getDisplayMedia({ video: true, audio: true })
          .then(getDisplayMediaSuccess)
          .then((stream) => {})
          .catch((e) => console.log(e));
      }
    }
  };
  useEffect(() => {
    if (screen) {
      getDisplayMedia();
    }
  }, [screen]);
  let handleScreen = () => {
    setScreen((prev) => !prev);
  };
  let sendMessage = () => {
    socketRef.current.emit("chat-message", message, username);
    setMessage("");
  };
  let handleCall = () => {
    try {
      let tracks = localVideoRef.current.srcObject.getTracks();
      tracks.forEach((tracks) => tracks.stop());
    } catch (e) {
      console.log(e);
    }
    routeTo("/home");
  };
  return (
    <div className={styles.wrapper}>
      {askForUsername ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 20px",
            maxWidth: "400px",
            margin: "auto",
            backgroundColor: "#f9f9f9",
            borderRadius: "16px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.1)",
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          }}
        >
          <h2 style={{ marginBottom: "24px", color: "#333" }}>
            Enter into Lobby:
          </h2>

          <TextField
            id="outlined-basic"
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
            fullWidth
            style={{ marginBottom: "20px" }}
          />

          <Button
            variant="contained"
            onClick={connect}
            style={{
              backgroundColor: "#1976d2",
              color: "#fff",
              padding: "10px 20px",
              fontWeight: "600",
              borderRadius: "8px",
              marginBottom: "30px",
              transition: "all 0.3s ease",
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = "#125ea4")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "#1976d2")}
          >
            Connect
          </Button>

          <div
            style={{
              width: "100%",
              height: "220px",
              borderRadius: "12px",
              overflow: "hidden",
              backgroundColor: "#000",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "12px",
              }}
            ></video>
          </div>
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          {showModal && (
            <div className={styles.chatRoom}>
              <div className={styles.chatContainer}>
                <h1>Chat</h1>
                <div className={styles.chattingDisplay}>
                  {messages.length > 0 ? (
                    messages.map((item, index) => (
                      <div style={{ marginBottom: "20px" }} key={index}>
                        <p style={{ fontWeight: "bold" }}>{item.sender}</p>
                        <p>{item.data}</p>
                      </div>
                    ))
                  ) : (
                    <p>No messages yet!</p>
                  )}
                </div>
                <div className={styles.chattingArea}>
                  <TextField
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    id="outlined-basic"
                    label="Enter your chat"
                    variant="outlined"
                  />
                  <Button variant="contained" onClick={sendMessage}>
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.buttonContainers}>
            <IconButton onClick={handleVideo} style={{ color: "white" }}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={handleCall} style={{ color: "red" }}>
              <CallEndIcon />
            </IconButton>
            <IconButton onClick={handleAudio} style={{ color: "white" }}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            {screenAvailable && (
              <IconButton onClick={handleScreen} style={{ color: "white" }}>
                {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
              </IconButton>
            )}
            <Badge badgeContent={newMessages} max={999} color="secondary">
              <IconButton
                onClick={() => {
                  setModal((prev) => {
                    const next = !prev;
                    if (next) setNewMessages(0);
                    return next;
                  });
                }}
                style={{ color: "white" }}
              >
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          <div className={styles.conferenceView}>
            {videos.map((video) => (
              <video
                key={video.socketId}
                data-socket={video.socketId}
                ref={(ref) => {
                  if (ref && video.stream) {
                    ref.srcObject = video.stream;
                  }
                }}
                autoPlay
                playsInline
              />
            ))}
            <video
              className={styles.meetUserVideo}
              ref={localVideoRef}
              autoPlay
              muted
            ></video>
          </div>
        </div>
      )}
    </div>
  );
}
