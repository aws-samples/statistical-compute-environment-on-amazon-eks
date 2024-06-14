#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { PositSceStack } from '../lib/posit-sce-stack'

const app = new cdk.App()
const stackName = app.node.tryGetContext('stackName')
new PositSceStack(app, stackName, { description: 'Posit SCE Stack' })
