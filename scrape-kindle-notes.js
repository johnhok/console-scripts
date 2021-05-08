await (async function bootstrap() {
  const restoreConsole = () => {
    var iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    console = iframe.contentWindow.console;
    window.console = console;
  };
  const loadSystemJS = async () =>
    new Promise((resolve) =>
      (function (d, script) {
        define = null;
        script = d.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.onload = function () {
          resolve();
        };
        script.src =
          "https://cdn.jsdelivr.net/npm/systemjs@6.8.3/dist/system.min.js";
        d.getElementsByTagName("head")[0].appendChild(script);
      })(document)
    );
  await restoreConsole();
  await loadSystemJS();
})();

await System.import(
  "https://cdn.jsdelivr.net/npm/jquery@3.2.1/dist/jquery.min.js"
);
await System.import(
  "https://cdn.jsdelivr.net/npm/dompurify@2.2.8/dist/purify.min.js"
);

AUTHOR_SELECTOR = "p.kp-notebook-metadata.a-spacing-none";

function sendLog(message) {
  console.log("LOG: " + message);
}

function onDoneSync() {
  window.startedSyncing = null;
  window.doneSyncing = true;
  sendLog(
    "Done sync, a total of " +
      (window.currentBookIndex + 1) +
      " books covered before finishing."
  );
}

function hashString(s) {
  // a simple hashing function taken from https://gist.github.com/iperelivskiy/4110988
  for (var i = 0, h = 0xdeadbeef; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
  return (h ^ (h >>> 16)) >>> 0;
}

// get uses the fetch API (promise-based), despite postRequest using AJAX
function getRequest(url) {
  return fetch(url, {
    headers: window.requestHeaders,
  }).then(function (response) {
    if (!response.ok) {
      throw Error(response.statusText);
    }
    return response.text();
  });
}

function afterSendBookData(isLastBook) {
  pullNextBook();
}

function parseHighlights(bookData) {
  return Object.keys(bookData.quotes)
    .map((key) => {
      const quote = bookData.quotes[key];
      const location = key.split("_")[0];
      return `- ${quote.text} ([Location ${location}](kindle://book?action=open&asin=${bookData.id}&location=${location}))`;
    })
    .join("<br />");
}

function parseThumbnail(bookData) {
  const imageUrl = bookData.imageUrl;
  const id = imageUrl.split("/").pop().split(".")[0];
  return `https://images-na.ssl-images-amazon.com/images/I/${id}._SL2000_.jpg`;
}

function generateNote(bookData) {
  return `<img src="${parseThumbnail(bookData)}" height="500" /><br /><br />

<h3>Metadata</h3><br /><br />

- Author: ${bookData.author}<br />
- Full Title: ${bookData.title}<br /><br />

<h3>Highlights</h3><br /><br />

${parseHighlights(bookData).trim()}`;
}

function sendBookData(bookData, lastBook) {
  let payload = JSON.stringify({
    bookData: bookData,
  });

  let hashedPayload = hashString(payload);

  console.log("Sending " + window.currentBookId + " (" + bookData.title + ")");
  console.log("Payload", payload);
  // construct markdown file
  const note = generateNote(bookData);
  const title = bookData.title.split(":")[0];
  const bearXCallbackUrl = `bear://x-callback-url/create?title=${encodeURIComponent(
    title
  )}&open_note=no&new_window=no&float=no&show_window=no&type=html&url=_&text=${encodeURIComponent(
    note
  )}`;
  window.location.href = bearXCallbackUrl;

  window.syncedBookHashes.push(hashedPayload);
  afterSendBookData(lastBook);
}

function onDonePullingBook() {
  var el = window.currentBookEl;
  var bookId = window.currentBookId;
  var bookEl = $("#annotation-scroller", el)[0];
  var bookData = {};
  console.log("el", el);

  bookData = {
    id: bookId,
    title: bookEl.querySelector("h3.kp-notebook-metadata").textContent.trim(),
    author: bookEl.querySelector(AUTHOR_SELECTOR).textContent.trim(),
    lastHighlightDate: window.allBookDates[bookId],
    quotes: {},
    imageUrl:
      bookEl.querySelector("img.kp-notebook-cover-image-border") &&
      bookEl.querySelector("img.kp-notebook-cover-image-border").src,
    lastBook: window.currentBookIndex === window.allBookIds.length - 1,
  };

  var asinFromDom = $("#kp-notebook-annotations-asin", el).val();
  if (asinFromDom !== bookId) {
    sendLog(
      "Mismatching asins: bookId (" +
        bookId +
        ") vs asinFromDom (" +
        asinFromDom +
        "). Aborting."
    );

    onDoneSync();
    return;
  }

  window.currentBookTitle = bookData.title;

  var highlightElements = $("#kp-notebook-annotations", el).children();
  var highlightTextEl, locationEl, location;
  var highlightCount = 0;

  highlightElements.each(function (index, highlightEl) {
    highlightTextEl = highlightEl.querySelector("#highlight");
    locationEl = highlightEl.querySelector("#kp-annotation-location");
    if (!locationEl || !highlightTextEl) {
      return; // skip the current element if it's not a highlight
    }
    highlightCount += 1;
    location = locationEl.value;
    location += "_" + highlightCount;
    var highlightColor = $("#annotationHighlightHeader", highlightEl)
      .text()
      .split(" ")[0]
      .trim()
      .toLowerCase();

    var highlightNote = highlightEl.querySelector("#note").innerText || null;
    if (highlightNote) {
      // Fix highlightNote in weird edgecase
      highlightEl.querySelector("#note").innerHTML = DOMPurify.sanitize(
        highlightEl.querySelector("#note").innerHTML.replace(/<br>/gim, "\n")
      );
      highlightNote = highlightEl.querySelector("#note").innerText || null;
    }

    bookData.quotes[location] = {
      text: highlightTextEl.textContent.trim(),
      note: highlightNote,
      color: highlightColor,
    };
  });

  console.log(
    "Pulled all " +
      Object.keys(bookData.quotes).length +
      " highlights for " +
      bookData.title
  );

  var unchangedBooksCutOff = 3;

  if (window.bookCounts) {
    var onLastSync = window.bookCounts[bookId];

    var numNotes = Object.values(bookData.quotes).filter(function (q) {
      return q.note !== null;
    }).length;
    var numHighlights = Object.values(bookData.quotes).length;

    if (onLastSync && onLastSync.highlights === numHighlights) {
      // && onLastSync.notes === numNotes) {
      // If this book hasn't updated highlights, update the unchangedCount
      window.unchangedCount++;
      console.log("unchangedCount: " + window.unchangedCount);
    } else {
      // console.log("Found mismatch: cookies say " + (onLastSync && onLastSync.highlights) + " vs our " + numHighlights);
      // If this book DID have updates, set the unchangedCount back to 0
      window.unchangedCount = 0;
    }

    if (unchangedCount === unchangedBooksCutOff) {
      // If 3 books in a row haven't changed, set this book to be
      // lastBook so that we exit early and save a redundant resync
      bookData.lastBook = true;
    }
  }
  sendBookData(bookData, bookData.lastBook);
}

function pullBookPages(pageToken, contentLimitState, isRetry) {
  var isFirstRequest = !pageToken && !contentLimitState;
  // TODO: use current bookid instead of hardcoding
  var url = "https://read.amazon.com/notebook?asin=" + window.currentBookId;
  if (isFirstRequest) {
    // set the url to its regular state if we are on the first page
    url += "&contentLimitState=&";
  } else {
    url +=
      "&token=" + pageToken + "&contentLimitState=" + contentLimitState + "&";
  }

  getRequest(url)
    .then(function (html) {
      var el = document.createElement("html");
      el.innerHTML = DOMPurify.sanitize(html);
      var nextPageToken = $(
        ".kp-notebook-annotations-next-page-start",
        el
      ).val();
      var nextContentLimitState = $(
        ".kp-notebook-content-limit-state",
        el
      ).val();

      if (isFirstRequest) {
        window.currentBookEl = document.createElement("html");
        window.currentBookEl.innerHTML = DOMPurify.sanitize(html);
      } else {
        $("#kp-notebook-annotations", window.currentBookEl).append(
          DOMPurify.sanitize(el.innerHTML)
        );
      }

      if (nextPageToken) {
        return pullBookPages(nextPageToken, nextContentLimitState);
      } else {
        return onDonePullingBook();
      }
    })
    .catch((err) => {
      if (isRetry) {
        // skip to the next book
        // TODO: there's still an edge case here where if this is the last book,
        // we won't send a book w/ the lastBook flag and thus won't create a resync
        sendLog(
          "Failed twice fetch highlights for " +
            window.currentBookId +
            " ... SKIPPING book"
        );
        pullNextBook();
      } else {
        // retry all failed requests once
        sendLog(
          "First failure to fetch highlights for " +
            window.currentBookId +
            " ... trying again"
        );
        pullBookPages(pageToken, contentLimitState, true);
      }
    });
}

function pullNextBook() {
  window.currentBookIndex += 1;
  window.currentBookId = window.allBookIds[window.currentBookIndex];
  window.currentBookEl = null;

  console.log("Starting to pull next book: " + window.currentBookId);
  if (window.currentBookId) {
    pullBookPages();
  }
}

function pullRemainingBookIds(bookIdsToken) {
  if (!bookIdsToken) {
    console.log("Pulled all book Ids from sidebar");
    return;
  }

  getRequest(
    "https://read.amazon.com/notebook?library=list&token=" + bookIdsToken
  ).then(function (html) {
    var el = document.createElement("html");
    el.innerHTML = DOMPurify.sanitize(html);

    // add these new book ids to the end of our existing ones
    var newBookIds = $(".kp-notebook-library-each-book", el)
      .map(function (b) {
        return this.id;
      })
      .get();
    window.allBookIds.push.apply(window.allBookIds, newBookIds);

    $("[id^=kp-notebook-annotated-date-]", el).each(function (b) {
      window.allBookDates[
        this.id.replace("kp-notebook-annotated-date-", "")
      ] = this.value;
    });

    // pull potentially more book ids
    var nextBookIdsToken = $(".kp-notebook-library-next-page-start", el).val();
    pullRemainingBookIds(nextBookIdsToken);
  });
}

(function start() {
  window.requestHeaders = {
    Connection: "keep-alive",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": navigator.userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9,ru;q=0.8,el;q=0.7",
  };

  // Global variables used in sync:
  window.allBookIds = null;
  window.allBookDates = null;
  window.currentBookIndex = null;
  window.currentBookEl = null;
  window.currentBookId = null;
  window.currentBookTitle = null;
  window.unchangedCount = 0;
  window.startedSyncing = Date.now();
  window.doneSyncing = false;
  window.syncedBookHashes = [];

  getRequest("https://read.amazon.com/notebook").then(function (html) {
    var el = document.createElement("html");
    el.innerHTML = DOMPurify.sanitize(html);

    window.allBookIds = $(".kp-notebook-library-each-book", el)
      .map(function (b) {
        return this.id;
      })
      .get();

    window.allBookDates = {};
    $("[id^=kp-notebook-annotated-date-]", el).each(function (b) {
      window.allBookDates[
        this.id.replace("kp-notebook-annotated-date-", "")
      ] = this.value;
    });

    var nextBookIdsToken = $(".kp-notebook-library-next-page-start", el).val();
    pullRemainingBookIds(nextBookIdsToken);

    window.currentBookIndex = -1;
    window.currentBookEl = null;
    pullNextBook();
  });
})();
