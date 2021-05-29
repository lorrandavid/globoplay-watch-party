// 'use strict';

// const VIDEO_URL_VALIDATOR = '/v/';
// const BBB_URL_VALIDATOR = '/big-brother-brasil/';

// let checkForVideo;
// let currentUrl;

// /** Check if current page contains video player */
// function isUrlVideo(url) {
//   return url.includes(VIDEO_URL_VALIDATOR);
// }

// /** Check if current page contains thumbnail list */
// function isUrlBBB(url) {
//   return url.includes(BBB_URL_VALIDATOR);
// }

// /** Show entire app div */
// function showScreen() {
//   document.querySelector('#app').setAttribute('style', 'opacity: 1 !important');
// }

// /** Hide entire app div to prevent spoilers before intervals */
// function hideScreen() {
//   document.querySelector('#app').removeAttribute('style');
// }

// /** Check for thumbnails in the current page */
// function handleThumbnails() {
//   const thumbnailWidget = Array.from(document.querySelectorAll('.thumbnail-widget'));
//   const playkitWidget = Array.from(document.querySelectorAll('.playkit-thumb-v2__image-wrapper'));
//   const widget =  thumbnailWidget.concat(playkitWidget);

//   if (widget && widget.length > 0) {
//     Array.from(widget).forEach(function (thumbnail) {
//       handleThumbnailWidget(thumbnail);
//     });

//     showScreen();
//     clearInterval(checkForVideo);
//   }
// }

// /** Hide every single thumbnail and title to prevent spoilers */
// function handleThumbnailWidget(thumbnail) {
//   const children = Array.from(thumbnail.children).filter(function (child) {
//     return child.nodeName === 'IMG';
//   });

//   children.forEach(function (child) {
//     child.remove();
//   });

//   thumbnail.style.background = '#000';
//   thumbnail.parentNode.querySelector('.video-widget__textbox').remove();
// }

// /** Handle video to stop and hide poster spoiler */
// function handleVideo() {
//   var video = document.querySelector('video');
//   var canStart = false;

//   if (video) {
//     video.setAttribute('poster', '');
//     video.pause();

//     video.addEventListener('canplay', function() {
//       if (!canStart) {
//         canStart = true;

//         setTimeout(function() {
//           video.pause();
//           showScreen();
//         }, 500);
//       }
//     });

//     video.addEventListener('ended', function() {
//       hideScreen();
//     });

//     clearInterval(checkForVideo);
//   }
// }

// /** Execute both functions whenever URL_CHANGES to see what's the current page */
// function app() {
//   checkForVideo = setInterval(function() {
//     if (isUrlVideo(currentUrl)) {
//       return handleVideo();
//     }

//     if (isUrlBBB(currentUrl)) {
//       return handleThumbnails();
//     }
//   }, 1000);
// }

// /** Add listener to chrome events */
// chrome.runtime.onMessage.addListener(function (request) {
//   currentUrl = window.location.href;

//   if (request.message === 'URL_CHANGED') {
//     if (checkForVideo) {
//       clearInterval(checkForVideo);
//     }

//     hideScreen();
//     app();
//   }
// });

function generateUUID() {
  let array = new Uint32Array(8);
  window.crypto.getRandomValues(array);
  let str = "";

  for (let i = 0; i < array.length; i++) {
    str += (i < 2 || i > 5 ? "" : "-") + array[i].toString(16).slice(-4);
  }

  return str;
}

(function () {
  var RequestTypes = {
    CREATE_SESSION: "createSession",
    LEAVE_SESSION: "leaveSession"
  };
  var hasLoaded = false;
  var isCommandReceived = false;
  var eventQueue = [];
  var mediaControl;
  var video;
  var socket = io("https://globoplay-watch-party.herokuapp.com");
  var roomId;

  socket.on("receivedCommand", triggerCommand);
  socket.on("receivedChat", renderMessageReceived);

  // Receives message when popup is used
  chrome.runtime.onMessage.addListener(function (request, _, sendResponse) {
    if (request.type === RequestTypes.CREATE_SESSION) {
      handleCreateSession(request.url, sendResponse);
    }

    if (request.type === RequestTypes.LEAVE_SESSION) {
      handleLeaveSession(request.roomId, sendResponse);
    }

    return true;
  });

  function handleCreateSession(url, sendResponse) {
    socket.emit("createSession", { url, roomId: generateUUID() }, function (response) {
        sendResponse(response);
      }
    );

    return true;
  }

  function handleLeaveSession(roomId, sendResponse) {
    socket.emit("leaveSession", { roomId }, function () {
        var urlParams = new URLSearchParams(window.location.search);
        sendResponse(true);
        window.location.href = window.location.href.replace(urlParams, '');
      }
    );

    return true;
  }

  /** Command switch */
  function triggerCommand(command) {
    if (!hasLoaded) {
      return eventQueue.push(command);
    }

    switch (command.type) {
      case "play":
      case "seeked":
        video[0].play();
        break;
      case "pause":
        video[0].pause();
        break;
      default:
        return;
    }

    video[0].currentTime = command.time;
    isCommandReceived = true;
  }

  /** Start application */
  function run() {
    checkSession();
    attachEvents();
    runEventQueue();
  }

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

  function checkStorage() {
    chrome.storage.local.get(["gpwUser"], function (response) {
      if (response.gpwUser && response.gpwUser.created && response.gpwUser.roomId) {
        roomId = response.gpwUser.roomId;
        window.history.replaceState(null, null, "?r=" + roomId);
        joinParty(roomId);
      }
    });
  }

  function joinParty(roomId) {
    socket.emit("joinSession", { url: window.location.href.replace(window.location.search, ''), roomId }, function(response) {
      if (response.joined) {
        renderParty();
      }
    });
  }

  function renderParty() {
    $('body').addClass('inParty');
    $('.inParty').prepend('<div class="gpw-wrapper"></div>');
    $('.player-fullscreen').appendTo('.gpw-wrapper');
    $('<div class="gpw-wrapper__chat"><div class="gpw-wrapper__chat__content"></div><div class="gpw-wrapper__chat__input"><input /></div></div>').appendTo('.gpw-wrapper');
    $('#app').remove();

    addPartyEvents();
  }

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

  function renderMessageSent(data) {
    $('.gpw-wrapper__chat__content').append('<div class="gpw-wrapper__chat__msg" data-senderName="'+ data.senderName +'"><div class="gpw-wrapper__chat__response"><span>'+ data.senderName +'</span><p>'+ data.message +'</p></div></div>');
  }

  function renderMessageReceived(data) {
    $('.gpw-wrapper__chat__content').append('<div class="gpw-wrapper__chat__msg" data-senderName="'+ data.senderName +'"><div><span>'+ data.senderName +'</span><p>'+ data.message +'</p></div></div>');
  }

  /** Attach events to controls */
  function attachEvents() {
    // video.on("play", function (e) {
    //   if (isCommandReceived) return;
    //   emmitPlayerCommand("play");
    // });

    // video.on("pause", function (e) {
    //   if (isCommandReceived) return;
    //   emmitPlayerCommand("pause");
    // });

    // video.on("seeked", function (e) {
    //   if (isCommandReceived) return;
    //   emmitPlayerCommand("seeked");
    // });
  }

  /** Emit a command to socket */
  function emmitPlayerCommand(type) {
    socket.emit("sendCommand", { type, time: e.target.currentTime });
    isCommandReceived = false;
  }

  /** Run event queue when receives commands while not ready */
  function runEventQueue() {
    eventQueue.forEach(function(event) {
      triggerCommand(event);
    });

    eventQueue = [];
  }

  /** Check if DOM exists */
  function hasDOM() {
    video = $("video[src]");
    mediaControl = $(".media-control-panel");

    return video && video.length && mediaControl && mediaControl.length;
  }

  var canStart = setInterval(function () {
    if (!hasDOM()) {
      return;
    }

    hasLoaded = true;
    clearInterval(canStart);
    run();
  }, 500);
})();
