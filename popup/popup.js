var $ = jQuery;
var GLOBOPLAY_URL = "://globoplay.globo.com/v/";
var userData;

$(function () {
  function showView(el) {
    $(".view").not(el).addClass("hidden");
    $(el).removeClass("hidden");
  }

  function handleShowParty(data) {
    if (!data.created) {
      return showView(".error");
    }

    chrome.storage.local.set({ gpwUser: data }, function () {
      $("#shareURL").val(data.url);
      showView(".inParty");

      setTimeout(function () {
        $("#shareURL").select();
      }, 100);
    });
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var { url, id } = tabs[0];

    if (!url.includes(GLOBOPLAY_URL)) {
      return showView(".notAvailable");
    } else {
      showView(".createParty");
    }

    chrome.storage.local.get(["gpwUser"], function (response) {
      userData = response.gpwUser;

      if (userData && userData.created && userData.roomId) {
        handleShowParty(userData);
      }
    });

    // When user clicks on Create Session button
    $("#createSession").on("click", function () {
      chrome.tabs.sendMessage(id, { type: "createSession", url }, function (response) {
          handleShowParty(response);
        }
      );
    });

    // When user clicks Leave Session button
    $("#leaveSession").on("click", function() {
      chrome.tabs.sendMessage(id, { type: "leaveSession", roomId: userData.roomId }, function () {
        chrome.storage.local.remove(["gpwUser"], function () {
          showView(".createParty");
        });
      });
    });
  });
});
