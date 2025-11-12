const maintenance = {
    "state": "no",
    "scheduled": "nov. 3. 16:00",
    "downtime": "30 minutes"
}



function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

function getCookie(name) {
    const cookies = document.cookie.split(";").map(cookie => cookie.trim());
    for (const cookie of cookies) {
        const [key, value] = cookie.split("=");
        if (decodeURIComponent(key) === name) return decodeURIComponent(value);
    }
    return null;
}

function expandSeries(handle) {
    const container = handle.children[1];
    container.style.height = "auto";
    const fullHeight = container.scrollHeight + "px";
    container.style.height = "0px";
    void container.offsetHeight;
    container.style.height = fullHeight;
    container.style.padding = "1rem";

    container.addEventListener("transitionend", function handler() {
        container.style.height = "auto";
        container.removeEventListener("transitionend", handler);
    });
}

function toggleSeries(handle) {
    const container = handle.children[1];
    const isCollapsed = container.dataset.opened === "false" || !container.dataset.opened;

    if (isCollapsed) {
        expandSeries(handle);
        container.dataset.opened = "true";
    } else {
        container.style.height = container.scrollHeight + "px";
        void container.offsetHeight;
        container.style.height = "0px";
        container.style.padding = "0rem";
        container.dataset.opened = "false";
    }

    return container.dataset.opened === "true";
}

function sanitizeString(str) {
    const temp = document.createElement("div");
    temp.textContent = str;
    return temp.innerHTML;
}

async function processEpisode(episode, path, episodecontainer, type) {
    console.log("processing episode: " + episode)
    const episodeName = episode;
    const episodePath = path.endsWith("/") ? path + episodeName : path + "/" + episodeName;

    let episodeHtml;
    try {
        episodeHtml = await fetch(episodePath).then(res => res.text());
    } catch (e) {
        console.warn("Failed to fetch:", episodePath);
        return;
    }

    const episodeDoc = new DOMParser().parseFromString(episodeHtml, "text/html");

    let files = Array.from(episodeDoc.querySelectorAll("a"))
        .filter(f => {
            const href = f.getAttribute("href");
            return href && /\.m3u8$/.test(href);
        });

    for (const file of files) {
        const filename = file.getAttribute("href");
        const filepath = episodePath.endsWith("/") ? episodePath + filename : episodePath + "/" + filename;
        const thumbnailPath = filepath.replace(".m3u8", ".jpg");

        const videoCard = document.createElement('div');
        videoCard.classList.add('video-card');
        if (type === "movie") { videoCard.classList.add("movie") }

        const thumbnail = document.createElement('img');
        thumbnail.src = thumbnailPath;
        thumbnail.alt = 'Thumbnail for ' + sanitizeString(filename);
        thumbnail.classList.add('thumbnail');

        const videoName = document.createElement('div');
        const cleanName = filename.replace('.m3u8', '');
        videoName.textContent = sanitizeString(cleanName.replaceAll(".", " "));
        videoName.classList.add('video-name');

        var status = getCookie(encodeURIComponent(cleanName));
        if (status) status = status.split(";")[0]
        videoName.style.borderTop =
            status === "watched" ? "3px solid #2ead20" :
            status === "viewed" ? "3px solid #ffff00" :
            "3px solid #333";

        const videoLink = document.createElement('a');
        videoLink.href = "/player.html?src=" + encodeURIComponent(filepath);
        videoLink.classList.add('video-link');
        videoLink.appendChild(thumbnail);
        videoLink.appendChild(videoName);

        videoCard.appendChild(videoLink);
        episodecontainer.appendChild(videoCard);
        console.log("end of processing: " + episode)
    }
}

function isnum(s) { return !isNaN(Number(s)) }

function getEpisodeNumber(basename) {
    basename = basename.toLowerCase();
    for (let i = 0; i < basename.length - 5; i++) {
        if (basename[i] === 's' && isnum(basename[i+1]) && isnum(basename[i+2])) {
            if (basename[i+3] === 'e' && isnum(basename[i+4]) && isnum(basename[i+5])) {
                return String(parseInt(basename.slice(i+4, i+6), 10));
                //return (basename[i+4] === '0' ? '' : basename[i+4]) + basename[i+5];
            }
        }
    }
    return null;
}

function fetchResource(basename) {
    return fetch(`/resource/${basename}`)
    .then(res => res.text())
    .then(html => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const dirs = Array.from(doc.querySelectorAll("a"));

        const videos = dirs
            .map(dir => dir.getAttribute("href"))
            .filter(href => !href?.startsWith("/") && href?.endsWith("/") && href.length > 1);

        let videoMap = new Map()
        videos.forEach(v => {
            videoMap.set(getEpisodeNumber(v), v);
        })

        videoMap = new Map([...videoMap.entries()].sort((a, b) => a - b));

        return [...videoMap.values()]
    })
}

fetch("/resource/")
.then(res => res.text())
.then(html => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const dirs = Array.from(doc.querySelectorAll("a"));
    const list = document.getElementById('video-list');

    const actualSeries = dirs.filter(dir =>
        dir.getAttribute("href")?.endsWith("/") && dir.getAttribute("href").length > 1
    );

    actualSeries.forEach(dir => {
        const dirName = dir.getAttribute("href");
        const path = "/resource/" + dirName;

        const seriescontainer = document.createElement("div");
        const seriesname = document.createElement("div");
        const episodecontainer = document.createElement("div");

        episodecontainer.dataset.opened = "false";
        seriescontainer.classList.add("seriescontainer");
        list.appendChild(seriescontainer);

        seriesname.innerText = decodeURIComponent(sanitizeString(dirName.replace("/", "").replaceAll(".", " ")));
        seriesname.classList.add("seriesname");
        seriesname.addEventListener("click", async () => {
            const isOpen = toggleSeries(seriescontainer);

            if (isOpen && episodecontainer.children.length === 0) {
                const resources = await fetchResource(dirName);
                const resourceType = resources.length > 1 ? "series" : "movie";
                seriescontainer.dataset.type = resourceType;
                for (const r of resources) {
                    await processEpisode(r, path, episodecontainer, resourceType);
                }
            }
        });

        seriescontainer.appendChild(seriesname);
        episodecontainer.classList.add("episodecontainer");
        seriescontainer.appendChild(episodecontainer);
    });
       
    const searchInput = document.getElementById("search");
    const video_list = document.getElementById("video-list");
    const all_videos = Array.from(video_list.children);

    searchInput.addEventListener("input", () => {
        const currentInput = searchInput.value.toLowerCase();
        const matchingVideos = all_videos.filter(video => {
            const name = video.querySelector(".seriesname").innerText.toLowerCase();
            return name.includes(currentInput);
        })
        video_list.innerHTML = "";
        matchingVideos.forEach(video => {
            video_list.appendChild(video)
        })
    })
});

function toggleView(mode) {
    const resources = document.getElementById("video-list");
    Array.from(resources.children).forEach(r => {
        if (r.dataset.type !== mode) {
            r.style.display = "none";
            r.style.visibility = "hidden";
        }
        if (r.dataset.type === mode && r.style.display === "none") {
            r.style.display = "flex";
            r.style.visibility = "visible";
        }
    })
}



document.addEventListener("DOMContentLoaded", ()=>{
    if (maintenance.state === "yes") {
        document.getElementById("schedate").textContent += maintenance.scheduled;
        document.getElementById("downtime").textContent += maintenance.downtime;
        document.querySelector(".mainholder").style.display = "flex";
    }
})