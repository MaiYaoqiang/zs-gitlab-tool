#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import {exec} from 'child_process';
import os from 'os';
import {Gitlab} from "@gitbeaker/node";
// 获取用户的主目录
const userHome = os.homedir();
const configFile = path.join(userHome, '.zs-gitlab-tool-config.json');


function promptUserForConfig() {
    return inquirer
        .prompt([
            {
                type: 'input',
                name: 'gitlabAddress',
                message: '请输入gitlab地址:',
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
        return config
    } else {
        console.log('未找到配置文件，请先配置');
        return await promptUserForConfig();
    }
}

// 获取 GitLab 客户端实例
const getGitlabClient = async () => {
    const config = await getConfig();
    const {token} = config;
    return new Gitlab({
        host: config.gitlabAddress, // 替换为你的 GitLab 地址
        token: token,
    });
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

const mergeBranch = async () => {
    const gitlab = await getGitlabClient()
    // 询问用户目标分支
    const {targetBranch, confirm} = await inquirer.prompt([
        {
            type: 'input',
            name: 'targetBranch',
            message: 'Enter the target branch (default: master):',
            default: 'master',
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: (answers) =>
                `Are you sure you want to merge ${targetBranch} into ${answers.targetBranch}?`,
        },
    ]);
}

const createBranch = () => {

}

const deleteBranch = () => {

}


mergeBranch()
