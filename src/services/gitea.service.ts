import axios from 'axios';

const GITEA_BASE_URL = 'https://git.productzillaacademy.com/api/v1';

export class GiteaService {
  async loginWithCredentials(username: string, password: string):Promise<string> {
    try {
      // Create a unique token name using a timestamp
      const tokenName = `git-task-recap-token-${Date.now()}`;
      
      const response = await axios.post(
        `${GITEA_BASE_URL}/users/${username}/tokens`,
        {
          name: tokenName,
          // You might need to adjust scopes based on Gitea version, usually empty generates a full token
          scopes: ['read:user', 'read:repository', 'read:organization']
        },
        {
          auth: {
            username,
            password
          }
        }
      );
      return response.data.sha1; // Gitea returns the token in the `sha1` field
    } catch (error: any) {
      if (error.response && error.response.status === 401) {
        throw new Error('Invalid Username or Password');
      }
      console.error('Error generating token:', error.response?.data || error.message);
      throw new Error('Failed to generate access token');
    }
  }

  async verifyUser(token: string) {
    try {
      const response = await axios.get(`${GITEA_BASE_URL}/user`, {
        headers: { Authorization: `token ${token}` }
      });
      return response.data; // Includes login, email, full_name, avatar_url
    } catch (error: any) {
      if (error.response && error.response.status === 401) {
        throw new Error('Invalid Access Token');
      }
      throw new Error('Failed to verify user with Gitea');
    }
  }

  async fetchAllPages(url: string, token: string): Promise<any[]> {
    let allData: any[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      try {
        const separator = url.includes('?') ? '&' : '?';
        const response = await axios.get(`${url}${separator}limit=50&page=${page}`, {
          headers: { Authorization: `token ${token}` }
        });
        
        if (response.data && response.data.length > 0) {
          allData = allData.concat(response.data);
          if (response.data.length < 50) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      } catch (error: any) {
        if (error.response && error.response.status === 404) {
             hasMore = false; // Stop if 404
        } else {
             throw error;
        }
      }
    }
    return allData;
  }

  async getProjects(token: string) {
    try {
      // 1. Get ALL personal/accessible repositories (paginated)
      let allRepos = await this.fetchAllPages(`${GITEA_BASE_URL}/user/repos`, token);

      // 2. Get organizations the user belongs to
      let orgNames = new Set<string>();
      try {
        const orgsRes = await this.fetchAllPages(`${GITEA_BASE_URL}/user/orgs`, token);
        orgsRes.forEach((org: any) => orgNames.add(org.username));
      } catch (orgsFallbackErr: any) {
        console.warn('Could not fetch organizations scope', orgsFallbackErr.message);
      }

      // 3. Explicitly add productzilla and solusiteknologikreatif just in case
      orgNames.add('productzilla');
      orgNames.add('solusiteknologikreatif');

      // 4. Get repositories for each organization (paginated)
      for (const orgName of Array.from(orgNames)) {
        try {
          const orgRepos = await this.fetchAllPages(`${GITEA_BASE_URL}/orgs/${orgName}/repos`, token);
          allRepos = allRepos.concat(orgRepos);
        } catch (orgErr: any) {
          console.error(`Failed to fetch repos for org ${orgName}`);
        }
      }

      // 5. Remove duplicates (based on repo id)
      const uniqueReposMap = new Map();
      allRepos.forEach(repo => {
        if (repo && repo.id) {
            uniqueReposMap.set(repo.id, repo);
        }
      });

      return Array.from(uniqueReposMap.values());
    } catch (error: any) {
      console.error('Failed to fetch projects', error.response?.data || error.message);
      throw new Error('Failed to fetch projects from Gitea');
    }
  }

  async getCommits(token: string, owner: string, repoName: string, authorName: string, authorEmail: string, since: string, until: string) {
    try {
      // Format timestamps for Gitea (expects RFC3339 datetime)
      const sinceDate = new Date(`${since}T00:00:00Z`).toISOString();
      const untilDate = new Date(`${until}T23:59:59Z`).toISOString();

      let allCommits: any[] = [];
      const branchNames: string[] = [];

      try {
        // Fetch all branches for the repo
        const branchesRes = await axios.get(`${GITEA_BASE_URL}/repos/${owner}/${repoName}/branches`, {
          headers: { Authorization: `token ${token}` },
          params: { limit: 100 }
        });
        branchesRes.data.forEach((branch: any) => branchNames.push(branch.name));
      } catch (e: any) {
        // Fallback to default branch if branch fetch fails
        branchNames.push(''); 
      }

      if (branchNames.length === 0) branchNames.push('');

      for (const branch of branchNames) {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const params: any = {
            stat: false,
            verification: false,
            files: false,
            page: page,
            limit: 50
          };
          if (branch) params.sha = branch;

          const response = await axios.get(`${GITEA_BASE_URL}/repos/${owner}/${repoName}/commits`, {
            headers: { Authorization: `token ${token}` },
            params: params
          });

          const commits = response.data;
          if (commits.length === 0) {
            hasMore = false;
          } else {
            for (const commitObj of commits) {
              const commitDate = new Date(commitObj.commit.committer.date).getTime();
              const sinceTime = new Date(sinceDate).getTime();
              // Add 1 full day to untilTime to make it inclusive of the whole end date regardless of timezone
              const untilTime = new Date(untilDate).getTime() + (24 * 60 * 60 * 1000);

              // Stop if commit is older than sinceTime (assumes reverse chronological order which is true for /commits)
              if (commitDate < sinceTime) {
                  hasMore = false;
                  break; 
              }

              if (commitDate <= untilTime && commitDate >= sinceTime) {
                  const author = commitObj.commit.author;
                  const authorNm = author?.name ? author.name.toLowerCase() : '';
                  const authorEm = author?.email ? author.email.toLowerCase() : '';
                  const commitAuthorLogin = commitObj.author?.login ? commitObj.author.login.toLowerCase() : '';
                  
                  const targetNm = authorName ? authorName.toLowerCase() : '';
                  const targetEm = authorEmail ? authorEmail.toLowerCase() : '';

                  // Match author by name, email, or login (case-insensitive)
                  if ((targetNm && authorNm.includes(targetNm)) || 
                      (targetEm && authorEm.includes(targetEm)) || 
                      (targetNm && commitAuthorLogin === targetNm)) {
                      
                      const commitData = {
                          ...commitObj.commit,
                          created_at: commitObj.commit.committer.date,
                          sha: commitObj.sha,
                          html_url: commitObj.html_url || '', // Link to the commit on Gitea
                          author_name: commitObj.commit.author?.name || '' // Full author name from Git config
                      };
                      
                      // Check for duplicates (same commit can exist on multiple merged branches)
                      if (!allCommits.some(c => c.sha === commitData.sha)) {
                          allCommits.push(commitData);
                      }
                  }
              }
            }

            if (commits.length < 50 || !hasMore) {
               hasMore = false;
            } else {
               page++;
            }
          }
        }
      }

      return allCommits;
    } catch (error: any) {
       console.error(`Error fetching commits for repo ${owner}/${repoName}`, error.response?.data || error.message);
      return []; // Return empty array instead of failing entire request for one errored repo
    }
  }
}
