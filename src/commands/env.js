'use strict';

const _ = require('lodash');
const Bacon = require('baconjs');

const AppConfig = require('../models/app_configuration.js');
const Env = require('../models/env.js');
const handleCommandStream = require('../command-stream-handler');
const Logger = require('../logger.js');
const variables = require('../models/variables.js');

function list (api, params) {
  const { alias, 'add-export': addExport } = params.options;

  const s_appData = AppConfig.getAppData(alias);
  const s_manualEnv = s_appData
    .flatMap(({ app_id, org_id }) => Env.list(api, app_id, org_id));
  const s_envFromAddons = s_appData
    .flatMap(({ app_id, org_id }) => Env.listFromAddons(api, app_id, org_id));
  const s_envFromDeps = s_appData
    .flatMap(({ app_id, org_id }) => Env.listFromDependencies(api, app_id, org_id));

  const s_fullEnv = Bacon.combineAsArray(s_manualEnv, s_envFromAddons, s_envFromDeps)
    .flatMapLatest(([manual, fromAddons, fromDeps]) => {

      Logger.println('# Manually set env variables');
      Logger.println(variables.render(manual, addExport));

      _.each(fromAddons, (addon) => {
        Logger.println('# Addon ' + addon.addon_name);
        Logger.println(variables.render(addon.env, addExport));
      });

      _.each(fromDeps, (dep) => {
        Logger.println('# Dependency ' + dep.app_name);
        Logger.println(variables.render(dep.env, addExport));
      });
    });

  handleCommandStream(s_fullEnv);
};

function set (api, params) {
  const [varName, varValue] = params.args;
  const { alias } = params.options;

  const s_env = AppConfig.getAppData(alias)
    .flatMapLatest(({ app_id, org_id }) => Env.set(api, varName, varValue, app_id, org_id))
    .flatMapLatest(() => Logger.println('Your environment variable has been successfully saved'));

  handleCommandStream(s_env);
};

function rm (api, params) {
  const [varName] = params.args;
  const { alias } = params.options;

  const s_env = AppConfig.getAppData(alias)
    .flatMapLatest(({ app_id, org_id }) => Env.remove(api, varName, app_id, org_id))
    .flatMapLatest(() => Logger.println('Your environment variable has been successfully removed'));

  handleCommandStream(s_env);
};

function importEnv (api, params) {
  const { alias } = params.options;

  const s_appData = AppConfig.getAppData(alias);
  const s_vars = variables.readFromStdin();

  const s_result = Bacon.combineAsArray(s_appData, s_vars)
    .flatMapLatest(([appData, vars]) => {
      return Env.bulkSet(api, vars, appData.app_id, appData.org_id);
    })
    .flatMapLatest(() => Logger.println('Environment variables have been set'));

  handleCommandStream(s_result);
};

function importEnvVars (api, params) {
  const [varNames] = params.args;
  const { alias } = params.options;

  const s_env = AppConfig.getAppData(alias)
    .flatMap(({ app_id, org_id }) => {
      return Bacon.fromArray(varNames.map((varName) => {
        return { app_id, org_id, varName };
      }));
    })
    .flatMap(({ app_id, org_id, varName }) => Env.set(api, varName, process.env[varName] || '', app_id, org_id))
    .last()
    .flatMapLatest(() => Logger.println('Your environment variables have been successfully saved'));

  handleCommandStream(s_env);
};

module.exports = { list, set, rm, importEnv, importEnvVars };
