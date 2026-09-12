# Background

I work in biophysics field. I do research in applied medicine. I am a head of laboratory. I prepare texts for journal manuscripts/ reports/ books /guideline etc. Currently, I use deepseek harness (dsh) to work with files. Mostly I compile .tex files, using journals' or grants' templates. Additionally, I keep data about authors in independent file. txt files but it works as database of co-authors with information about their impact, orcids, etc. More than that I created special protocols for my students and people who work with me. People have to provide their data as folder with README.md describing experiment, setup, goal, motivation, with data source (it can be stack of tiff, or csv/parcquet/pickle etc) or figure (expanded caption as independent file). It help me to check data, workflows and metadata. Reference manager is zotero but I keep folder with all pdfs in the same project. Notes and ideas I keep in tex or md files. Version control is implemented via git and manual save of compiled pdf as version.

# Problem

The problem is about sharing project. As I mentioned I have to use .doc files to work with colleagues. More than that I have to use dsh, latex, terminal, pdf viewer, zotero etc. Pubmed and google scholar for research. Choose models for rewriting, planning, construction. It is a complicated setup. Additionally, I have to check how the data and reports by students were created manually. It is hard, It consumes time. I decided assemble this workflow in software. Modern alternative to overflow (i think).

# My idea

The idea is to develop a software to handle scientific texts preparation. I want to make the software module-based.

Modules I can see:

* file editor. File editor is classical main tool to write text, check grammar and syntaxes. It should have submodules. For example, when I work on paragraph, sometimes I write the basic text and want to rewrite it. I always save the written paragraph in independent file and open in second screen to look at and work on style and rewrite. The idea is to select lines i want to change, click button "rewrite" and in this editor would be opened split on a right from existing text (not a second window, split on a right from selected text while text before and after stay before and after). Split is empty space where it is possible to write new text by hand or using LLM from UNSLOTH or other provider. Why should it be a submodule? As minimum reason is that we need to have specific skill or rules for writing for example. The model would follow specific rules. And with such approach we can use the same provider, same model but with different context. When we would call "write with ai" or "rewrite with ai" it would be like promt injection into new temporal chat. After new text in split would be ready we can accept the modification and remove existing text or "accept with version control" saving the replaced text as version of this paragraph. For every paragraph It is important to have something like header S2SS3P4L325 (just example with s-section, ss-subsection, p-paragraph,l-line). Submodules important because can be developed independently as new features.  
* latex part for compilation. Nothing fancy, just a module to set up profile, templates (different journals, reports) etc. Here i am not sure, do i need a virtual machine or it would be just scripts to run commands in terminal of local machine. I think i need something like sandbox of the software.
* pdf viewer. Can be used with editor to see updates of tex files.

* Build in zotero. More simple, pdf viewer, tag system for references, full library with projects libraries. For example, i do research, find interesting papers, add them into general lib. Decided to use it in a couple of projects, place tag project 1 project 2 and can see tboth papers in independent project's libraries (with automatic bib creation inside of project). Important feature is too parse and add reference using pubmed or achiv api etc.
* data files, something like s3 artifact database with data from students etc. It should have something like specific field for creation instead of simple folder. The user like student getting the task would have to fill fields like goal, instrument, materials, motication, data(files) to add it to database. So thsi part for cooperation and data control. additionally it should has tag system, same logic as reference manager, to simlink data to "specific project database" instead of real copying.
* module for conductor of this software. It would be LLM chat with built-in mcp just for commands inside of software. To create a workflow like "edit section in manuscript n, add 2 coauthors, add 7 new references, change template from mdpi to nature ". So workflow can be done without the user. More than that it can help people who does not like to do something by hand (for example edit template of journal)
* Module for research, basically parser of pubmed scholar and other data resources with LLM. User provides promt about research and interesting field.LLM processes the promt and shows key words, rewritten idea, field topic etc. Importantly how to sort, by dates, what years, how many papers does user need and return list of  papers with URL/dois/brief explanation etc. More than that, this module has to follow chat/dsh logic with many sessions. Becuse, for example, I found 9 papers. I read them. I like them, i want to add 7 of them in my project but why? Here the promt, add a specific reason as note for this paper. 50 papers -> 50 notes, this notes can be used as references in text of paper.
* Version control git and database

In general every module can be supported by LLM with specific skills and rules. It is an idea. Currently, I see block/module as injection system plus independence provides better development cycle (as i see)*

# Open questions and ideas

* Collaboration option
* Task management, students get tasks, fill form, data would come into databasem can be used in any project

# Question

What do you think about such design? We are working on conception only. I need to design the architecture for such software.
