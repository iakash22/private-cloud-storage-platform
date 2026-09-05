import boxen from 'boxen';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import type { ContainerStatus } from './docker.js';
import type { ServiceHealth, StartupStatus } from './status.js';

export interface RenderOptions {
  color?: boolean;
}

const COL = {
  name: 11,
  health: 7,
  endpoint: 17,
  detail: 14,
  container: 8,
} as const;

function pad(value: string, width: number): string {
  if (value.length >= width) {
    return value.slice(0, width);
  }
  return `${value}${' '.repeat(width - value.length)}`;
}

function cell(value: string, width: number, paint?: (text: string) => string): string {
  const clipped = value.length > width ? `${value.slice(0, width - 1)}…` : value;
  const padded = pad(clipped, width);
  return paint ? paint(padded) : padded;
}

function healthPaint(
  health: ServiceHealth,
  color: boolean,
): ((text: string) => string) | undefined {
  if (!color) {
    return undefined;
  }
  if (health === 'alive') {
    return chalk.green;
  }
  if (health === 'down') {
    return chalk.red;
  }
  return chalk.yellow;
}

function containerCell(container: ContainerStatus | undefined): string {
  if (!container || container.state === 'unknown') {
    return '—';
  }
  return container.state;
}

function containerHealth(container: ContainerStatus | undefined): ServiceHealth {
  if (container?.state === 'up') {
    return 'alive';
  }
  if (container?.state === 'down') {
    return 'down';
  }
  return 'unknown';
}

function renderTitle(serverName: string, color: boolean): string {
  const ascii = figlet.textSync(serverName, {
    font: 'Small',
    horizontalLayout: 'fitted',
    width: 48,
  });

  if (!color) {
    return ascii;
  }

  return gradient(['#22d3ee', '#818cf8', '#e879f9']).multiline(ascii);
}

export function renderStartupBanner(status: StartupStatus, options: RenderOptions = {}): string {
  const color = options.color ?? true;
  const heading = (text: string): string => (color ? chalk.cyan(text) : text);
  const title = renderTitle(status.serverName, color);
  const subtitle = color ? chalk.dim('private cloud storage') : 'private cloud storage';

  const summary = `${status.healthyCount}/${status.serviceCount} alive · ${status.nodeVersion} · ${status.environment}`;
  const header = [
    cell('SERVICE', COL.name),
    cell('STATUS', COL.health),
    cell('PORT', COL.endpoint),
    cell('NOTE', COL.detail),
    cell('DOCKER', COL.container),
  ].join(' ');

  const serviceLines = status.services.map((service) =>
    [
      cell(service.name, COL.name),
      cell(service.health, COL.health, healthPaint(service.health, color)),
      cell(service.endpoint, COL.endpoint),
      cell(service.detail, COL.detail),
      cell(
        containerCell(service.container),
        COL.container,
        healthPaint(containerHealth(service.container), color),
      ),
    ].join(' '),
  );

  const dockerLine = status.dockerAvailable
    ? status.containers
        .map((container) => `${container.name.replace('vaultstack-', '')} ${container.state}`)
        .join(' · ')
    : 'docker CLI missing';

  const body = [
    color ? chalk.bold(summary) : summary,
    '',
    heading(header),
    ...serviceLines,
    '',
    heading('CONTAINERS'),
    dockerLine,
  ].join('\n');

  const panel = boxen(body, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: 0,
    width: 64,
    borderStyle: 'round',
    borderColor: color ? 'magenta' : undefined,
    title: status.serverName,
    titleAlignment: 'center',
  });

  return `${title}\n${subtitle}\n${panel}`;
}
