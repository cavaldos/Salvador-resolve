import assert from 'node:assert/strict';
import test from 'node:test';
import { readFolderProject, writeFolderProject } from '../src/modules/projects/services/folder-project-document.ts';
import { makeProject } from '../src/modules/projects/utils/project-utils.ts';

const project = makeProject('Location footage', { duration: 3 });
project.assetIds = ['asset-01'];
project.folder = { id: 'local-permission', files: [{ id: 'asset-01', name: 'Cảnh 01 #.MP4' }] };
project.tracks = [{
  id: 'track-01', type: 'video', name: 'Video', order: 0,
  hidden: false, locked: false, muted: false,
  clips: [{
    id: 'clip-01', trackId: 'track-01', assetId: 'asset-01', type: 'video', name: 'Clip',
    timelineStart: 1, timelineDuration: 2, sourceStart: 4, sourceDuration: 2, speed: 1,
    transform: { x: 0, y: 0, width: 1920, height: 1080, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, fitMode: 'contain' },
    adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: 0, sepia: 0 },
    audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
  }],
}];

test('folder file round-trips edits with relative video names and no machine permissions', () => {
  const contents = writeFolderProject(project);
  const { folder, ...expectedProject } = project;
  assert.deepEqual(readFolderProject(contents), { version: 1, project: expectedProject, files: folder.files });
  assert.ok(!contents.includes(folder.id));
  assert.equal(makeProject('Ordinary project').folder, undefined);
});

test('rejects unrecognized versions, paths, and ambiguous video mappings', () => {
  const document = JSON.parse(writeFolderProject(project));
  assert.throws(() => readFolderProject(JSON.stringify({ ...document, version: 2 })), /invalid/);
  for (const name of ['../video.mp4', 'C:\\video.mp4', '/video.mp4']) {
    assert.throws(() => readFolderProject(JSON.stringify({ ...document, files: [{ id: 'asset-01', name }] })), /invalid/);
  }
  assert.throws(() => readFolderProject(JSON.stringify({ ...document, files: [...document.files, ...document.files] })), /invalid/);
});
