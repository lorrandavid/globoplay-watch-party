var RequestTypes = {
  CREATE_SESSION: "createSession",
  LEAVE_SESSION: "leaveSession"
};
var VIDEO_URL_VALIDATOR = '/v/';
var BBB_URL_VALIDATOR = '/big-brother-brasil/';

// var socket = io("https://globoplay-watch-party.herokuapp.com");
var socket = io("http://localhost:3000");
var hasLoaded = false; // Check if extension has loaded
var hasSetupVideo = false; // Check if video event has already been setup
var isCommandReceived = false; // Prevent emission to Socket io
var eventQueue = [];

var video; // Video element
var roomId; // Socket io room
var currentUrl; // Current page
var mediaControl; // Media control element
var canStart; // Interval to check if page is ready

// Receives command or chat when socket io is used
socket.on("receivedCommand", triggerCommand);
socket.on("receivedChat", renderMessageReceived);

// Receives message when popup is used
chrome.runtime.onMessage.addListener(function (request, _, sendResponse) {
  currentUrl = window.location.href;

  if (request.type === RequestTypes.CREATE_SESSION) {
    handleCreateSession(request.url, sendResponse);
  }

  if (request.type === RequestTypes.LEAVE_SESSION) {
    handleLeaveSession(request.roomId, sendResponse);
  }

  if (request.message === 'URL_CHANGED') {
    hideScreen();
    app();
  }

  return true;
});

// Generate a random id (used for rooms)
function generateUUID() {
  let array = new Uint32Array(8);
  window.crypto.getRandomValues(array);
  let str = "";

  for (let i = 0; i < array.length; i++) {
    str += (i < 2 || i > 5 ? "" : "-") + array[i].toString(16).slice(-4);
  }

  return str;
}

// Creates a new session
function handleCreateSession(url, sendResponse) {
  video.get(0).pause();

  socket.emit("createSession", { url, roomId: generateUUID(), time: video.get(0).currentTime }, function (response) {
      window.history.replaceState(null, null, "?r=" + response.roomId);
      handleState(response.state);
      sendResponse(response);
    }
  );

  return true;
}

// Leave current session
function handleLeaveSession(roomId, sendResponse) {
  socket.emit("leaveSession", { roomId }, function () {
      var urlParams = new URLSearchParams(window.location.search);
      sendResponse(true);
      window.location.href = window.location.href.replace(urlParams, '');
    }
  );

  return true;
}

// Choose which command to execute
function triggerCommand(command) {
  if (!hasLoaded) {
    return eventQueue.push(command);
  }

  isCommandReceived = true;

  switch (command.type) {
    case "play":
      video.get(0).play();
      break;
    case "pause":
      video.get(0).pause();
      break;
    default:
      return;
  }

  isCommandReceived = true;
  video.get(0).currentTime = command.time;
}

// Attach events
function attachEvents() {
  video.on("play", function (e) {
    if (isCommandReceived || !roomId) {
      isCommandReceived = false;
      return;
    };

    emmitPlayerCommand("play", e.target.currentTime);
  });

  video.on("pause", function (e) {
    if (isCommandReceived || !roomId) {
      isCommandReceived = false;
      return;
    };

    emmitPlayerCommand("pause", e.target.currentTime);
  });
}

// Send command to socket io
function emmitPlayerCommand(type, time) {
  socket.emit("sendCommand", { type, time, roomId });
  isCommandReceived = false;
}

// Start application
function run() {
  checkSession();
  runEventQueue();
}

// Check if user should be placed in a room according to url
function checkSession() {
  var urlParams = new URLSearchParams(window.location.search);
  roomId = urlParams.get("r");

  // If user is joining from a specific party URL
  if (roomId) {
    return joinParty(roomId);
  }

  // If user already has an active session started
  checkStorage();
}

// Check if user should be placed in a room according to his storage
function checkStorage() {
  chrome.storage.local.get(["gpwUser"], function (response) {
    if (response.gpwUser && response.gpwUser.created && response.gpwUser.roomId) {
      roomId = response.gpwUser.roomId;
      window.history.replaceState(null, null, "?r=" + roomId);
      joinParty(roomId);
    }
  });
}

// Join an existing party
function joinParty(roomId) {
  isCommandReceived = true;
  video.get(0).pause();

  socket.emit("joinSession", { url: window.location.href.replace(window.location.search, ''), roomId }, function(response) {
    if (response.joined) {
      handleState(response.state);
      renderParty();
    }
  });
}

// Handle changes based on rooms current state
function handleState(state) {
  var time = state.currentTime;
  var status = state.playerStatus;
  isCommandReceived = true;

  if (status === "play") {
    video.get(0).play();
  } else {
    video.get(0).pause();
  }

  isCommandReceived = true;
  video.get(0).currentTime = time;
}

// Render divs for watch party
function renderParty() {
  $('body').addClass('inParty');
  $('.inParty').prepend('<div class="gpw-wrapper"></div>');
  $('.player-fullscreen').appendTo('.gpw-wrapper');
  $('<div class="gpw-wrapper__chat"><div class="gpw-wrapper__chat__content"></div><div class="gpw-wrapper__chat__input"><input /></div></div>').appendTo('.gpw-wrapper');
  $('#app').remove();

  addPartyEvents();
}

// Render divs for messages sent
function renderMessageSent(data) {
  $('.gpw-wrapper__chat__content').append('<div class="gpw-wrapper__chat__msg" data-senderName="'+ data.senderName +'"><div class="gpw-wrapper__chat__response"><span>'+ data.senderName +'</span><p>'+ data.message +'</p></div></div>');
}

// Render divs for messages received
function renderMessageReceived(data) {
  $('.gpw-wrapper__chat__content').append('<div class="gpw-wrapper__chat__msg" data-senderName="'+ data.senderName +'"><div><span>'+ data.senderName +'</span><p>'+ data.message +'</p></div></div>');
}

// Add events to Watch Party Elements
function addPartyEvents() {
  $('.gpw-wrapper__chat__input input').on('keypress', function(e) {
    if (e.which === 13 && e.target.value) {
      $(this).attr("disabled", "disabled");

      var payload = {
        roomId: roomId,
        senderName: 'Temp',
        message: $(this).val()
      };

      socket.emit("sendChat", payload, function(response) {
        renderMessageSent(response);
      });

      $(this).removeAttr("disabled");
      $(this).val('');
      $(this).focus();
    }
  });
}

// Run event queue when receives commands while not ready
function runEventQueue() {
  eventQueue.forEach(function(event) {
    triggerCommand(event);
  });

  eventQueue = [];
}

// /** Check if current page contains video player
function isUrlVideo(url) {
  return url.includes(VIDEO_URL_VALIDATOR);
}

// Check if current page contains thumbnail list
function isUrlBBB(url) {
  return url.includes(BBB_URL_VALIDATOR);
}

// Show entire app div
function showScreen() {
  $('#app').addClass('showScreen');
}

// Hide entire app div to prevent spoilers before intervals
function hideScreen() {
  $('#app').removeClass('showScreen');
}

// Check for thumbnails in the current page
function handleThumbnails() {
  const widget = $('.thumbnail-widget, .playkit-thumb-v2__image-wrapper');

  if (widget && widget.length > 0) {
    widget.each(function() {
      handleThumbnailWidget(this);
    });

    clearInterval(canStart);
    showScreen();
  }
}

// Hide every single thumbnail and title to prevent spoilers
function handleThumbnailWidget(thumbnail) {
  var children = $(thumbnail).children('img');

  children.each(function () {
    this.remove();
  });

  $(thumbnail).css('background', '#000000');
  $(thumbnail).siblings('.video-widget__textbox').remove();
}

// Setup initial video
function handleVideo() {
  video = $('video[id]');
  mediaControl = $(".media-control-panel");

  if (video && video.length && mediaControl && mediaControl.length) {
    video.attr('poster', '');
    video.get(0).pause();

    if (video.get(0).readyState >= video.get(0).HAVE_ENOUGH_DATA && !hasSetupVideo) {
      setTimeout(function() {
        hasSetupVideo = true;
        video.get(0).pause();
        attachEvents();
        showScreen();
        run();
      }, 500);

      video.on('ended', function() {
        hideScreen();
      });
    }

    clearInterval(canStart);
  }
}

function app() {
  canStart = setInterval(function () {
    if (!isUrlVideo(currentUrl) && !isUrlBBB(currentUrl)) {
      return;
    }

    hasLoaded = true;

    if (isUrlVideo(currentUrl)) {
      return handleVideo();
    }

    if (isUrlBBB(currentUrl)) {
      return handleThumbnails();
    }
  }, 500);
}
