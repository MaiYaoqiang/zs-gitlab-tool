#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import {exec, execSync} from 'child_process';
import os from 'os';
import {Gitlab} from "@gitbeaker/node";
import dayjs from "dayjs";
// 获取用户的主目录
const userHome = os.homedir();
const configFile = path.join(userHome, '.zs-gitlab-tool-config.json');


function promptUserForConfig() {
    return inquirer
        .prompt([
            {
                type: 'input',
                name: 'gitlabAddress',
                message: '请输入gitlab地址(默认：https://git.gdzskj.ltd):',
                default: "https://git.gdzskj.ltd"
            },
            {
                type: 'input',
                name: 'token',
                message: '请输入gitlab-token:',
            },
        ])
        .then((answers) => {
            fs.writeFileSync(configFile, JSON.stringify(answers, null, 2));
            console.log(`Configuration saved to ${configFile}`);
            return answers;
        });
}

let getConfig = async () => {
    fs.existsSync(configFile)
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    // 检查配置文件
    if (config && config.token && config.gitlabAddress) {
        getConfig = async () => {
            return config
        }
        return config
    } else {
        console.log('未找到配置文件，请先配置');
        return await promptUserForConfig();
    }
}

// 获取 GitLab 客户端实例
let getGitlabClient = async () => {
    const config = await getConfig();
    const gitlab = new Gitlab({
        host: config.gitlabAddress, // 替换为你的 GitLab 地址
        token: config.token,
    });
    getGitlabClient = async () => {
        return gitlab
    }
    return gitlab
}

const getProjectPath = () => {
    const gitConfigPath = path.join(process.cwd(), '.git/config');

    if (!fs.existsSync(gitConfigPath)) {
        throw new Error('Not a Git repository or missing .git/config');
    }

    const gitConfig = fs.readFileSync(gitConfigPath, 'utf-8');

    // 匹配远程仓库 URL，支持 SSH 和 HTTPS 格式
    const match = gitConfig.match(/url = .*[:\/](.+\/.+)\.git/);

    if (match && match[1]) {
        return match[1]; // 返回 namespace/project-name
    } else {
        throw new Error('Failed to parse projectPath from .git/config');
    }
}

// 获取当前分支名
function getCurrentBranch() {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
}

const useGitlab = async () => {
    const gitlab = await getGitlabClient()
    let user
    try {
        user = await gitlab.Users.current();
    } catch (e) {
        // token 失效
        console.log('Token 失效，请重新配置后重试')
        return await promptUserForConfig();
    }

    const projectPath = getProjectPath();
    const project = await gitlab.Projects.show(projectPath);
    return {
        gitlab,
        project,
        projectPath,
        currentBranch: getCurrentBranch(),
        user,
    }
}

// 检查是否已包含目标分支
async function checkBranchMerged(gitlab, projectId, sourceBranch, targetBranch) {
    const diff = await gitlab.Repositories.compare(projectId, targetBranch, sourceBranch);
    if (diff.commits.length > 0) {
        console.log(`❗️ ${sourceBranch} 未合并 ${targetBranch}. 请先合并 ${targetBranch} 到 ${sourceBranch}`);
        return false;
    }
    console.log(`✅ ${sourceBranch} 已校验合并 ${targetBranch}.`);
    return true;
}

// 检查是否有冲突
async function checkMergeConflicts(gitlab, projectId, sourceBranch, targetBranch) {
    try {
        await gitlab.MergeRequests.create(projectId, {
            source_branch: sourceBranch,
            target_branch: targetBranch,
            title: 'Temporary MR for conflict checking',
            dry_run: true, // 仅模拟合并请求，不实际创建
        });
        console.log(`✅ ${sourceBranch} 和 ${targetBranch}无冲突`);
        return false;
    } catch (error) {
        if (error.response?.data?.message === 'This merge request cannot be merged') {
            console.log(`❗️ ${sourceBranch} 和 ${targetBranch}存在冲突`);
            return true;
        }
        throw error;
    }
}

// 通过 GitLab API 获取项目的默认分支
async function getMainBranchFromGitLab() {
    const projectPath = getProjectPath();
    const gitlab = await getGitlabClient()
    try {
        // 获取项目的详细信息
        const project = await gitlab.Projects.show(projectPath);
        return project.default_branch; // 获取并返回默认分支
    } catch (error) {
        console.error('Error fetching project info:', error.message);
        throw new Error('Failed to get default branch from GitLab API.');
    }
}

// 定义轮询查询的函数
async function checkMergeStatus(mergeRequestIid) {
    const maxRetries = 10; // 最大轮询次数
    let retries = 0; // 当前轮询次数
    const {gitlab, project, projectPath, currentBranch} = await useGitlab()
    try {
        // 获取合并请求的详细信息
        const mergeRequest = await gitlab.MergeRequests.show(projectPath, mergeRequestIid);

        console.log(`合并请求状态: ${mergeRequest.merge_status}`);

        // 判断是否可以合并
        if (mergeRequest.merge_status === 'can_be_merged') {
            console.log('合并请求可以直接合并。');

            // 执行合并操作
            const mergedMR = await gitlab.MergeRequests.accept(projectPath, mergeRequestIid);
            console.log(`合并请求已成功合并: ${mergedMR.web_url}`);
        } else if (mergeRequest.merge_status === 'cannot_be_merged') {
            console.log('合并请求无法合并，存在冲突。', mergeRequest.web_url);
        } else if (mergeRequest.merge_status === 'checking') {
            // 如果合并请求状态是 checking，表示正在检查合并
            console.log('合并请求正在检查中，请稍后...');
            // 如果没有达到最大轮询次数，则继续轮询
            if (retries < maxRetries) {
                retries++;
                setTimeout(checkMergeStatus, 1000); // 每秒轮询一次
            } else {
                console.log('已达到最大重试次数，合并检查失败。', mergeRequest.web_url);
            }
        } else {
            console.log('合并请求状态异常。', mergeRequest.web_url);
        }
    } catch (error) {
        console.error('错误:', error.message);
    }
}

// 获取分支描述信息
const getMergeTitleByBranch = (branch) => {
    // 假设branch是feature-myq-20240131-描述-m-123,m-345,m-567123
    const reg1 = /(m|f)-(\d+),?/g;
    const ids = branch.match(reg1)?.map(item => {
        // 把m-或f-和结尾的逗号去掉
        return item.replace(/,/g, "")
    })
    const infoStr = branch?.replace(reg1, "")

    const reg2 = /([^-]+)-([^-]+)-(\d+)-([^-]*)/
    const res = infoStr?.match(reg2) || []

    const type = res[1]
    const user = res[2]
    const version = res[3]
    const desc = res[4]

    return [
        'mr',
        version,
        desc,
        "resolve",
    ].filter(i => i).join("-") + ' ' + (ids?.join(',') || "")

}

const mergeBranch = async () => {
    const {gitlab, project, projectPath, currentBranch} = await useGitlab()
    const mainBranch = await getMainBranchFromGitLab();
    // 询问用户目标分支
    const {targetBranch, confirm} = await inquirer.prompt([
        {
            type: 'input',
            name: 'targetBranch',
            message: `请输入要合并的分支 (默认: ${mainBranch}):`,
            default: mainBranch,
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: (answers) =>
                `是否确认合并 ${targetBranch} into ${answers.targetBranch}?`,
        },
    ]);
    if (!confirm) {
        console.log('取消合并');
        return;
    }
    // 检查是否已包含主分支内容
    const isMerged = await checkBranchMerged(gitlab, project.id, currentBranch, mainBranch);
    if (!isMerged) {
        // console.log(`主分支${mainBranch}未被合并，请先合并主分支到当前分支${currentBranch}`);
        return;
    }

    // 检查是否有冲突
    const hasConflicts = await checkMergeConflicts(gitlab, project.id, currentBranch, targetBranch);
    if (hasConflicts) {
        // console.log(`${currentBranch}与${targetBranch}有冲突，请先解决后重试`);
        return;
    }

    const mergeTitle = getMergeTitleByBranch(currentBranch)
    try {
        const mergeCreate = await gitlab.MergeRequests.create(project.id, {
            source_branch: currentBranch,
            target_branch: targetBranch,
            title: mergeTitle,
            remove_source_branch: false, // 如果需要合并后删除源分支，设为 true
        });

        await checkMergeStatus(mergeCreate.iid)
        console.log(`合并成功: ${mergeCreate.web_url}`);
    } catch (error) {
        console.error('Failed to create merge request:', error.response?.data || error.message);
    }
}

const createBranch = async () => {
    const {gitlab, project, projectPath} = await useGitlab()
    const defaultBranch = await getMainBranchFromGitLab()
    // 询问用户是否使用默认分支创建
    const {targetBranch, feiShuId, desc} = await inquirer.prompt([
        {
            type: 'input',
            name: 'targetBranch',
            message: `请输入要基于哪个分支创建 (默认: ${defaultBranch}):`,
            default: defaultBranch,
        },
        {
            type: 'input',
            name: 'feiShuId',
            message: '请输入飞书事项id，如有多个可英文逗号分隔:',
            validate: (input) => input.trim() ? true : '事项id不能为空。',
        },
        {
            type: 'input',
            name: 'desc',
            message: `请输入需求描述(可选):`,
        },
    ]);

    const timeStr = dayjs().format('YYYYMMDD')
    const newBranchName = `feature-myq-${timeStr}-${desc ? `${desc}-` : ''}m-${feiShuId}`
    try {
        // 创建分支
        const branch = await gitlab.Branches.create(projectPath, newBranchName, targetBranch);
        console.log(`基于 ${targetBranch} 分支创建 ${newBranchName} 创建成功，。`);
        // console.log(`新分支信息:`, branch);
    } catch (error) {
        console.error('创建分支失败:', error.message);
    }
}


createBranch()
