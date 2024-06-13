import React, { useState, useMemo, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/cjs/styles/prism";
import "./styles.css";
import {
  extractRepoInfo,
  getAvailableVersions,
  getReleaseNotes,
  filterVersions,
  authenticateOctokit,
  normalizeVersion,
} from "./logic";
import semver from "semver";

const plugins = [remarkGfm];

const ErrorMessage = ({ message }) => {
  return (
    <div className="error-message">
      <p>{message}</p>
    </div>
  );
};

const CustomMarkdown = ({ children }) => {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || "");

          return !inline && match ? (
            <SyntaxHighlighter
              style={dracula}
              PreTag="div"
              language={match[1]}
              {...props}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
};

export function App(props) {
  const [releaseNotes, setReleaseNotes] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [fromVersion, setFromVersion] = useState("");
  const [toVersion, setToVersion] = useState("");
  // const [repoUrl, setRepoUrl] = useState(
  //   "https://github.com/facebook/react-native/"
  // );
  const [repoUrl, setRepoUrl] = useState(
    "https://github.com/facebook/react-native/releases"
  );
  const [availableVersions, setAvailableVersions] = useState([]);
  const [filteredVersions, setFilteredVersions] = useState([]);
  const [filteredReleases, setFilteredReleases] = useState([]);
  const [filters, setFilters] = useState({
    includePatch: true,
    includeMinor: true,
    includeMajor: true,
    includeBeta: true,
    includeRc: true,
  });
  const [authToken, setAuthToken] = useState("");
  const [tmpAuthToken, setTmpAuthToken] = useState("");
  const [loading, setLoading] = useState(true);

  const { owner, repo } = useMemo(() => extractRepoInfo(repoUrl), [repoUrl]);

  const fetchAllAvailableVersions = async () => {
    setLoading(true);

    try {
      const versions = await getAvailableVersions(owner, repo);
      setAvailableVersions(versions);
      // setFilteredVersions(
      //   filterVersions(versions, {
      //     ...filters,
      //   })
      // );
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!!authToken) {
      authenticateOctokit(authToken);
      fetchAllAvailableVersions();
    }
  }, [authToken]);

  useEffect(() => {
    if (owner && repo) {
      fetchAllAvailableVersions();
    }
  }, [owner, repo]);

  useEffect(() => {
    const applyFilters = () => {
      const newFilteredReleases = releaseNotes.filter((release) => {
        const version = release.validVersion;
        const tagName = release.tagName;
        const prerelease = semver.prerelease(version) || [];

        const {
          includePatch,
          includeMinor,
          includeMajor,
          includeBeta,
          includeRc,
        } = filters;

        if (tagName === fromVersion || tagName === toVersion) {
          return true;
        }

        if (!includeBeta && prerelease.includes("beta")) {
          return false;
        }

        if (!includeRc && prerelease.includes("rc")) {
          return false;
        }

        if (!includePatch && semver.patch(version) > 0) {
          return false;
        }

        if (
          !includeMinor &&
          semver.minor(version) > 0 &&
          semver.patch(version) === 0
        ) {
          return false;
        }

        if (
          !includeMajor &&
          semver.major(version) > 0 &&
          semver.minor(version) === 0 &&
          semver.patch(version) === 0
        ) {
          return false;
        }

        return true;
      });

      setFilteredReleases(newFilteredReleases);
    };

    applyFilters();
  }, [filters, fromVersion, toVersion]);

  const fetchReleaseNotes = async () => {
    setLoading(true);

    try {
      const notes = await getReleaseNotes(owner, repo, fromVersion, toVersion);

      setReleaseNotes(notes);
      setFilteredReleases(notes);

      // setFilteredReleases(
      //   filterVersions(
      //     notes,
      //     {
      //       ...filters,
      //     },
      //     fromVersion,
      //     toVersion
      //   )
      // );
      setError();
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (event) => {
    const { name, checked } = event.target;

    setFilters((prevFilters) => ({
      ...prevFilters,
      [name]: checked,
    }));
    // setFilteredVersions(
    //   filterVersions(availableVersions, {
    //     ...filters,
    //     [name]: checked,
    //   })
    // );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    fetchReleaseNotes();
  };

  const renderFilters = () => {
    return (
      <div className="filters">
        <label>
          <input
            type="checkbox"
            name="includeMajor"
            checked={filters.includeMajor}
            onChange={handleFilterChange}
          />
          Major
        </label>
        <label>
          <input
            type="checkbox"
            name="includeMinor"
            checked={filters.includeMinor}
            onChange={handleFilterChange}
          />
          Minor
        </label>

        <label>
          <input
            type="checkbox"
            name="includePatch"
            checked={filters.includePatch}
            onChange={handleFilterChange}
          />
          Patch
        </label>
        <label>
          <input
            type="checkbox"
            name="includeBeta"
            checked={filters.includeBeta}
            onChange={handleFilterChange}
          />
          Beta
        </label>
        <label>
          <input
            type="checkbox"
            name="includeRc"
            checked={filters.includeRc}
            onChange={handleFilterChange}
          />
          RC
        </label>
      </div>
    );
  };

  const renderForm = () => {
    return (
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="repoUrl">Repository URL:</label>
          <input
            type="text"
            id="repoUrl"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="Enter repository URL"
            required
          />
        </div>
        <div className="input-group">
          <label htmlFor="fromVersion">From Version:</label>
          <select
            id="fromVersion"
            value={fromVersion}
            onChange={(e) => setFromVersion(e.target.value)}
            required
          >
            <option value="">Select a version</option>
            {availableVersions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label htmlFor="toVersion">To Version:</label>
          <select
            id="toVersion"
            value={toVersion}
            onChange={(e) => setToVersion(e.target.value)}
            required
            disabled={!fromVersion}
          >
            <option value="">Select a version</option>
            {!!fromVersion &&
              availableVersions
                // .filter((av) => {
                //   return semver.gte(av, fromVersion);
                // })
                .map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
          </select>
        </div>

        <div className="filters">{renderFilters()}</div>

        <div className="button-container">
          <button type="submit">Show Release Notes</button>
        </div>
      </form>
    );
  };

  const renderContent = () => {
    if (loading) {
      return <div className="loader" />;
    }

    if (error) {
      return <ErrorMessage message={error} />;
    }

    return (
      <div className="release-container">
        {filteredReleases.map((note) => (
          <div key={note.tagName} className="release-note">
            <div className="release-note-header">
              <h2
                onClick={() => {
                  window.open("" + note.htmlUrl, "_blank");
                }}
                style={{
                  cursor: "pointer",
                  color: "blue",
                  textDecoration: "underline",
                }}
              >
                {note.tagName}
              </h2>
              <span>{new Date(note.publishedDate).toLocaleDateString()}</span>{" "}
              {note.preRelease && <span>[Pre-release]</span>}
            </div>
            {/* <ReactMarkdown remarkPlugins={plugins}>{note.body}</ReactMarkdown> */}
            <CustomMarkdown>{note.body}</CustomMarkdown>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="App">
      <p>
        Primary rate limit for unauthenticated requests is 60 requests per hour.
        Authenticate to increase your rate limit.
      </p>

      <div className="input-group">
        <label htmlFor="authToken">GitHub Token:</label>
        <input
          type="text"
          id="authToken"
          value={tmpAuthToken}
          onChange={(e) => setTmpAuthToken(e.target.value)}
          onBlur={(e) => {
            setAuthToken(tmpAuthToken);
          }}
          placeholder="Enter GitHub token"
        />
      </div>

      <div>
        {renderForm()}
        {renderContent()}
      </div>
    </div>
  );
}
