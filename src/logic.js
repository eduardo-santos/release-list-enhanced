const { Octokit } = require("@octokit/rest");
import semver from "semver";

const createOctokitInstance = (authToken) => {
  return new Octokit(authToken ? { auth: authToken } : {});
};

let octokit = createOctokitInstance();

const getAllRepoReleases = async (owner, repo) => {
  let releases = [];
  let page = 1;
  let morePages = true;

  while (morePages) {
    const response = await octokit.repos.listReleases({
      owner,
      repo,
      per_page: 100,
      page: page,
    });

    releases = releases.concat(response.data);

    if (response.data.length < 100) {
      morePages = false;
    } else {
      page++;
    }
  }

  return releases;
};

export const authenticateOctokit = (authToken) => {
  octokit = createOctokitInstance(authToken);
};

export const extractRepoInfo = (url) => {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;

    const pathParts = pathname.split("/").filter((part) => part);
    if (pathParts.length < 2) {
      throw new Error("Invalid URL format");
    }

    const owner = pathParts[0];
    const repo = pathParts[1];
    return { owner, repo };
  } catch (error) {
    throw new Error("Invalid URL");
  }
};

export const getAvailableVersions = async (owner, repo) => {
  let versions = [];
  let page = 1;
  let morePages = true;

  while (morePages) {
    const response = await octokit.repos.listTags({
      owner,
      repo,
      per_page: 100,
      page: page,
    });

    versions = versions.concat(response.data.map((tag) => tag.name));

    if (response.data.length < 100) {
      morePages = false;
    } else {
      page++;
    }
  }

  // return versions.filter((v) => normalizeVersion(v) !== null);
  return versions;
};

export const normalizeVersion = (version) => {
  if (typeof version !== "string") return null;

  // If the version includes a package name, strip it
  const atIndex = version.lastIndexOf("@");
  if (atIndex !== -1) {
    version = version.slice(atIndex + 1);
  }

  // If the version starts with "v", remove it
  if (version.startsWith("v")) {
    version = version.slice(1);
  }

  // Regular expression to match valid version strings
  const versionRegex = /^(v?\d+\.\d+)(?:\.(\d+))?(-\w+)?$/;

  const match = version.match(versionRegex);
  if (!match) return null;

  const majorMinor = match[1];
  const patch = match[2] ? match[2] : "0";
  const preRelease = match[3] ? match[3] : "";

  return `${majorMinor}.${patch}${preRelease}`;
};

export async function getReleaseNotes(owner, repo, fromVersion, toVersion) {
  let releases = await getAllRepoReleases(owner, repo);

  fromVersion = normalizeVersion(fromVersion);
  toVersion = normalizeVersion(toVersion);

  releases = releases.filter((release) => {
    const version = normalizeVersion(release.tag_name);

    if (version === null) return false;

    return semver.gte(version, fromVersion) && semver.lte(version, toVersion);
  });

  console.log({ releases });

  let shouldReverse = false;

  let releaseNotes = releases.map((re) => ({
    tagName: re.tag_name,
    htmlUrl: re.html_url,
    name: re.name,
    body: re.body,
    preRelease: re.prerelease,
    publishedDate: re.published_at,
    validVersion: normalizeVersion(re.tag_name),
  }));

  releaseNotes = releaseNotes.sort((a, b) =>
    semver.rcompare(a.validVersion, b.validVersion)
  );

  if (shouldReverse) return releaseNotes.reverse();

  return releaseNotes;
}

export const filterVersions = (versions, filters, fromVersion, toVersion) => {
  const [fromMajor, fromMinor, fromPatch] = fromVersion
    .substring(1)
    .split(".")
    .map(Number);
  const [toMajor, toMinor, toPatch] = toVersion
    .substring(1)
    .split(".")
    .map(Number);

  return versions.filter((version) => {
    const [major, minor, patch] = version.tagName
      .substring(1)
      .split(".")
      .map(Number);

    if (major === fromMajor && major === toMajor) {
      // If major versions are the same, check for minor and patch
      if (minor >= fromMinor && minor <= toMinor) {
        if (minor === fromMinor && minor === toMinor) {
          return (
            patch >= fromPatch &&
            patch <= toPatch &&
            matchesFilters(version, filters)
          );
        } else if (minor === fromMinor) {
          return patch >= fromPatch && matchesFilters(version, filters);
        } else if (minor === toMinor) {
          return patch <= toPatch && matchesFilters(version, filters);
        } else {
          return matchesFilters(version, filters);
        }
      } else {
        return false;
      }
    } else {
      // Include all versions if major versions are different
      return matchesFilters(version, filters);
    }
  });
};

export const filterDropdownVersions = (versions, filters) => {
  if (!filters.includeRc) {
    versions = versions.filter((v) => !v?.toLowerCase().includes("rc"));
  }

  if (!filters.includeBeta) {
    versions = versions.filter((v) => !v?.toLowerCase().includes("beta"));
  }

  versions = versions.filter((v) => !v?.toLowerCase().includes("preview"));
  versions = versions.filter((v) => !v?.toLowerCase().includes("alpha"));

  return versions;
};

const matchesFilters = (version, filters) => {
  const [major, minor, patch] = version.tagName
    .substring(1)
    .split(".")
    .map(Number);

  if (filters.includeMajor && filters.includeMinor && filters.includePatch) {
    return true; // All versions are included
  }

  if (!filters.includeMajor && major !== 0) {
    return false; // Exclude non-major versions
  }

  if (!filters.includeMinor && minor !== 0) {
    return false; // Exclude non-minor versions
  }

  if (!filters.includePatch && patch !== 0) {
    return false; // Exclude non-patch versions
  }

  return true;
};
