#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { PositSceStack } from '../lib/posit-sce-stack'
import { Aspects } from 'aws-cdk-lib';

import { AwsSolutionsChecks } from 'cdk-nag'
const app = new cdk.App()

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))
const stackName = app.node.tryGetContext('stackName')
new PositSceStack(app, stackName, { description: 'Posit SCE Stack' })
