/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import * as dom5 from 'dom5';
import {ASTNode, parse as _parse, ParserOptions} from 'parse5';

import * as matchers from './matchers';

/**
 * Move the `node` to be the immediate sibling after the `target` node.
 * TODO(usergenic): Migrate this code to polymer/dom5 and when you do, use
 * insertNode which will handle the remove and the splicing in once you have
 * the index.
 */
export function insertAfter(target: ASTNode, node: ASTNode) {
  dom5.remove(node);
  const index = target.parentNode!.childNodes!.indexOf(target);
  target.parentNode!.childNodes!.splice(index + 1, 0, node);
  node.parentNode = target.parentNode!;
}

/**
 * Move the entire collection of nodes to be the immediate sibling before the
 * `after` node.
 */
export function insertAllBefore(
    target: ASTNode, after: ASTNode, nodes: ASTNode[]) {
  let lastNode = after;
  for (let n = nodes.length - 1; n >= 0; n--) {
    const node = nodes[n];
    dom5.insertBefore(target, lastNode, node);
    lastNode = node;
  }
}

/**
 * Return true if node is a text node that is empty or consists only of white
 * space.
 */
export function isBlankTextNode(node: ASTNode): boolean {
  return node && dom5.isTextNode(node) &&
      dom5.getTextContent(node).trim() === '';
}

/**
 * Return true if node is a comment node consisting of a license (annotated by
 * the `@license` string.)
 */
export function isLicenseComment(node: ASTNode): boolean {
  if (dom5.isCommentNode(node)) {
    return dom5.getTextContent(node).indexOf('@license') > -1;
  }
  return false;
}

/**
 * Return true if node is a comment node that is a server-side-include.  E.g.
 * <!--#directive ...-->
 */
export function isServerSideIncludeComment(node: ASTNode): boolean {
  return !!node.data && !!node.data.match(/^#/);
}

/**
 * Inserts the node as the first child of the parent.
 * TODO(usergenic): Migrate this code to polymer/dom5
 */
export function prepend(parent: ASTNode, node: ASTNode) {
  if (parent.childNodes && parent.childNodes.length) {
    dom5.insertBefore(parent, parent.childNodes[0], node);
  } else {
    dom5.append(parent, node);
  }
}

/**
 * Removes an AST Node and the whitespace-only text node following it, if
 * present.
 */
export function removeElementAndNewline(node: ASTNode, replacement?: ASTNode) {
  const siblings = Array.from(node.parentNode!.childNodes!);
  let nextIdx = siblings.indexOf(node) + 1;
  let next = siblings[nextIdx];
  while (next && isBlankTextNode(next)) {
    dom5.remove(next);
    next = siblings[++nextIdx];
  }
  if (replacement) {
    dom5.replace(node, replacement);
  } else {
    dom5.remove(node);
  }
}

/**
 * When parse5 parses an HTML document, it tries to fill in a few html tags
 * it considers missing if it doesn't see them (see `injectedTagNames` const
 * above.)  This function removes these elements from the AST so the AST
 * represents only the html that was parsed.  The primary signal is that the
 * node has no `__location` information, so this function can only reliably
 * be used on a fresh parse, since subsequent tree manipulations may inject
 * nodes without location information.
 *
 * TODO(usergenic): Remove this function after porting it to dom5.  Also
 * remove the equivalent from `polymer-analyzer` since that's where this was
 * duplicated from.  https://github.com/Polymer/dom5/issues/49
 */
export function removeFakeNodes(ast: dom5.Node) {
  const injectedNodes = dom5.queryAll(
      ast,
      dom5.predicates.AND(
          (node) => !Boolean(node.__location) && Boolean(node.parentNode),
          dom5.predicates.OR(
              dom5.predicates.hasTagName('html'),
              dom5.predicates.hasTagName('head'),
              dom5.predicates.hasTagName('body'))));
  for (const node of injectedNodes.reverse()) {
    const children = (node.childNodes || []).slice();
    for (const child of children) {
      dom5.insertBefore(node.parentNode!, node, child);
    }
    dom5.remove(node);
  }
}

/**
 * A common pattern is to parse html and then remove the fake nodes.
 * This function dries up that pattern.
 */
export function parse(html: string, options: ParserOptions): ASTNode {
  const ast = _parse(html, options);
  removeFakeNodes(ast);
  return ast;
}

/**
 * Return all sibling nodes following node.
 */
export function siblingsAfter(node: ASTNode): ASTNode[] {
  const siblings: ASTNode[] = Array.from(node.parentNode!.childNodes!);
  return siblings.slice(siblings.indexOf(node) + 1);
}

/**
 * Find all comment nodes in the document, removing them from the document
 * if they are note license comments, and if they are license comments,
 * deduplicate them and prepend them in document's head.
 */
export function stripComments(document: ASTNode) {
  const uniqueLicenseTexts = new Set<string>();
  const licenseComments: ASTNode[] = [];
  for (const comment of dom5.nodeWalkAll(document, dom5.isCommentNode)) {
    if (isServerSideIncludeComment(comment)) {
      continue;
    }

    // Make whitespace uniform so we can deduplicate based on actual content.
    const commentText = (comment.data || '').replace(/\s+/g, ' ').trim();

    if (isLicenseComment(comment) && !uniqueLicenseTexts.has(commentText)) {
      uniqueLicenseTexts.add(commentText);
      licenseComments.push(comment);
    }

    removeElementAndNewline(comment);
  }
  const prependTarget = dom5.query(document, matchers.head) || document;
  for (const comment of licenseComments.reverse()) {
    prepend(prependTarget, comment);
  }
}